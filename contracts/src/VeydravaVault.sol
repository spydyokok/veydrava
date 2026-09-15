// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title VeydravaVault
/// @notice Single-asset, non-upgradeable spending vault. Agents authorize only exact ERC20 payments.
/// @dev Owner is fully trusted. EIP-712 binds signatures to this vault, chain, policy and epoch.
///      Daily limits use UTC calendar days; lifetime spend NEVER resets on policy changes.
///      Only vetted, non-rebasing, non-fee-on-transfer ERC20 assets are supported.
contract VeydravaVault is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    enum Decision {
        Allowed,
        VaultPaused,
        InactiveAgent,
        AgentExpired,
        PolicyChanged,
        EpochChanged,
        RecipientDenied,
        ZeroAmount,
        IntentExpired,
        BadNonce,
        PerPaymentLimit,
        AgentDailyLimit,
        LifetimeLimit,
        VaultDailyLimit,
        InsufficientBalance,
        ApprovalRequired
    }

    struct Policy {
        uint256 perPayment;
        uint256 dailyLimit;
        uint256 lifetimeLimit;
        uint256 approvalThreshold;
        uint256 validUntil;
        uint256 version;
        uint256 epoch;
        bool active;
    }

    struct SpendIntent {
        address agent;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        uint256 policyVersion;
        uint256 epoch;
        bytes32 memo;
    }

    IERC20 public immutable asset;
    uint8 public immutable assetDecimals;
    uint256 public globalDailyLimit;
    uint256 public authorizationEpoch = 1;
    mapping(address => Policy) public policies;
    mapping(address => mapping(address => bool)) public recipients;
    mapping(address => uint256) public nonces;
    mapping(address => uint256) public lifetimeSpent;
    mapping(address => mapping(uint256 => uint256)) public dailySpent;
    mapping(uint256 => uint256) public globalDailySpent;
    mapping(bytes32 => bool) public approvals;
    address[] private _agents;
    mapping(address => bool) private _registered;
    mapping(address => address[]) private _recipientLists;
    mapping(address => mapping(address => bool)) private _recipientKnown;
    mapping(address => SpendIntent) private _pendingIntents;
    mapping(address => bytes) private _pendingSignatures;

    bytes32 public constant SPEND_TYPEHASH = keccak256(
        "SpendIntent(address agent,address recipient,uint256 amount,uint256 nonce,uint256 deadline,uint256 policyVersion,uint256 epoch,bytes32 memo)"
    );

    error InvalidConfiguration();
    error InvalidSignature();
    error PolicyViolation(Decision reason);
    error UnsupportedTokenBehavior();
    error RenounceDisabled();
    error NativeTransferFailed();

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event PolicyUpdated(address indexed agent, uint256 version, uint256 epoch);
    event RecipientUpdated(address indexed agent, address indexed recipient, bool allowed);
    event AgentRevoked(address indexed agent, uint256 version);
    event NonceInvalidated(address indexed agent, uint256 newNonce);
    event GlobalLimitUpdated(uint256 limit);
    event AuthorizationEpochChanged(uint256 epoch);
    event IntentApproval(bytes32 indexed digest, bool approved);
    event IntentSubmitted(bytes32 indexed digest, address indexed agent, address indexed recipient, uint256 amount);
    event SpendExecuted(
        bytes32 indexed digest,
        address indexed agent,
        address indexed recipient,
        uint256 amount,
        uint256 nonce,
        bytes32 memo
    );
    event TokenRecovered(address indexed token, address indexed recipient, uint256 amount);
    event NativeRecovered(address indexed recipient, uint256 amount);

    constructor(address initialOwner, address token, uint256 dailyLimit_)
        Ownable(initialOwner)
        EIP712("VeydravaVault", "1")
    {
        if (token.code.length == 0 || dailyLimit_ == 0) revert InvalidConfiguration();
        asset = IERC20(token);
        uint8 decimals_ = IERC20Metadata(token).decimals();
        if (decimals_ > 18) revert InvalidConfiguration();
        assetDecimals = decimals_;
        globalDailyLimit = dailyLimit_;
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function agentCount() external view returns (uint256) {
        return _agents.length;
    }

    function getAgents(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        if (limit > 100) revert InvalidConfiguration();
        uint256 count = offset >= _agents.length ? 0 : _agents.length - offset;
        if (count > limit) count = limit;
        result = new address[](count);
        for (uint256 i; i < count; ++i) {
            result[i] = _agents[offset + i];
        }
    }

    function getPendingIntent(address agent) external view returns (SpendIntent memory, bytes memory) {
        return (_pendingIntents[agent], _pendingSignatures[agent]);
    }

    function recipientCount(address agent) external view returns (uint256) {
        return _recipientLists[agent].length;
    }

    function getRecipients(address agent, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory result)
    {
        if (limit > 100) revert InvalidConfiguration();
        uint256 count = offset >= _recipientLists[agent].length ? 0 : _recipientLists[agent].length - offset;
        if (count > limit) count = limit;
        result = new address[](count);
        for (uint256 i; i < count; ++i) {
            result[i] = _recipientLists[agent][offset + i];
        }
    }

    function setPolicy(
        address agent,
        uint256 perPayment,
        uint256 dailyLimit_,
        uint256 lifetimeLimit_,
        uint256 approvalThreshold,
        uint256 validUntil
    ) external onlyOwner {
        if (
            agent == address(0) || agent == address(this) || agent == owner() || perPayment == 0
                || perPayment > dailyLimit_ || dailyLimit_ > lifetimeLimit_ || lifetimeLimit_ < lifetimeSpent[agent]
                || approvalThreshold > perPayment || validUntil <= block.timestamp
        ) {
            revert InvalidConfiguration();
        }
        uint256 nextVersion = policies[agent].version + 1;
        if (!_registered[agent]) {
            _registered[agent] = true;
            _agents.push(agent);
        }
        policies[agent] = Policy(
            perPayment,
            dailyLimit_,
            lifetimeLimit_,
            approvalThreshold,
            validUntil,
            nextVersion,
            authorizationEpoch,
            true
        );
        emit PolicyUpdated(agent, nextVersion, authorizationEpoch);
    }

    /// @notice An allowlist edit also invalidates every previously signed intent for this agent.
    function setRecipient(address agent, address recipient, bool allowed) external onlyOwner {
        if (
            policies[agent].version == 0 || recipient == address(0) || recipient == address(this)
                || recipient == address(asset)
        ) revert InvalidConfiguration();
        recipients[agent][recipient] = allowed;
        if (!_recipientKnown[agent][recipient]) {
            _recipientKnown[agent][recipient] = true;
            _recipientLists[agent].push(recipient);
        }
        policies[agent].version++;
        emit RecipientUpdated(agent, recipient, allowed);
        emit PolicyUpdated(agent, policies[agent].version, policies[agent].epoch);
    }

    function revokeAgent(address agent) external onlyOwner {
        policies[agent].active = false;
        policies[agent].version++;
        emit AgentRevoked(agent, policies[agent].version);
    }

    function invalidateNonce(address agent, uint256 newNonce) external onlyOwner {
        if (newNonce <= nonces[agent]) revert InvalidConfiguration();
        nonces[agent] = newNonce;
        delete _pendingIntents[agent];
        delete _pendingSignatures[agent];
        emit NonceInvalidated(agent, newNonce);
    }

    function setGlobalDailyLimit(uint256 limit) external onlyOwner {
        if (limit == 0) revert InvalidConfiguration();
        globalDailyLimit = limit;
        emit GlobalLimitUpdated(limit);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Invalidate all agent policies and all outstanding signatures in one transaction.
    function revokeAllAgents() external onlyOwner {
        authorizationEpoch++;
        emit AuthorizationEpochChanged(authorizationEpoch);
    }

    /// @notice The new owner must explicitly reauthorize agents after ownership handover.
    function acceptOwnership() public override {
        super.acceptOwnership();
        authorizationEpoch++;
        if (!paused()) _pause();
        emit AuthorizationEpochChanged(authorizationEpoch);
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function hashIntent(SpendIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(SPEND_TYPEHASH, intent)));
    }

    /// @notice Preview is advisory. It does not validate the agent signature or reserve funds.
    function previewSpend(SpendIntent calldata intent) public view returns (Decision) {
        if (paused()) return Decision.VaultPaused;
        Policy memory p = policies[intent.agent];
        if (!p.active) return Decision.InactiveAgent;
        if (block.timestamp >= p.validUntil) return Decision.AgentExpired;
        if (intent.policyVersion != p.version) return Decision.PolicyChanged;
        if (intent.epoch != authorizationEpoch || p.epoch != authorizationEpoch) return Decision.EpochChanged;
        if (
            !recipients[intent.agent][intent.recipient] || intent.recipient == address(0)
                || intent.recipient == address(this)
        ) return Decision.RecipientDenied;
        if (intent.amount == 0) return Decision.ZeroAmount;
        if (block.timestamp >= intent.deadline || intent.deadline > p.validUntil) return Decision.IntentExpired;
        if (intent.nonce != nonces[intent.agent]) return Decision.BadNonce;
        if (intent.amount > p.perPayment) return Decision.PerPaymentLimit;
        uint256 spent = dailySpent[intent.agent][currentDay()];
        if (spent > p.dailyLimit || intent.amount > p.dailyLimit - spent) return Decision.AgentDailyLimit;
        spent = lifetimeSpent[intent.agent];
        if (spent > p.lifetimeLimit || intent.amount > p.lifetimeLimit - spent) return Decision.LifetimeLimit;
        spent = globalDailySpent[currentDay()];
        if (spent > globalDailyLimit || intent.amount > globalDailyLimit - spent) return Decision.VaultDailyLimit;
        if (intent.amount > asset.balanceOf(address(this))) return Decision.InsufficientBalance;
        if (intent.amount > p.approvalThreshold && !approvals[hashIntent(intent)]) return Decision.ApprovalRequired;
        return Decision.Allowed;
    }

    /// @notice Approval never bypasses the allowlist, expiry or any budget.
    function setIntentApproval(SpendIntent calldata intent, bool approved) external onlyOwner {
        bytes32 digest = hashIntent(intent);
        if (approved) {
            Decision decision = previewSpend(intent);
            if (decision != Decision.Allowed && decision != Decision.ApprovalRequired) {
                revert PolicyViolation(decision);
            }
        }
        approvals[digest] = approved;
        emit IntentApproval(digest, approved);
    }

    /// @notice One pending request per agent, stored on chain for owner review on any device.
    /// @dev A later signed request at the same nonce replaces the queue entry. No funds are reserved.
    function submitIntent(SpendIntent calldata intent, bytes calldata signature) external nonReentrant {
        bytes32 digest = hashIntent(intent);
        if (signature.length > 4096 || !SignatureChecker.isValidSignatureNow(intent.agent, digest, signature)) {
            revert InvalidSignature();
        }
        Decision decision = previewSpend(intent);
        if (decision != Decision.Allowed && decision != Decision.ApprovalRequired) revert PolicyViolation(decision);
        _pendingIntents[intent.agent] = intent;
        _pendingSignatures[intent.agent] = signature;
        emit IntentSubmitted(digest, intent.agent, intent.recipient, intent.amount);
    }

    /// @notice Anyone may relay a valid signed intent; the signature fixes the recipient and amount.
    function executeSpend(SpendIntent calldata intent, bytes calldata signature) external nonReentrant {
        bytes32 digest = hashIntent(intent);
        if (!SignatureChecker.isValidSignatureNow(intent.agent, digest, signature)) revert InvalidSignature();
        Decision decision = previewSpend(intent);
        if (decision != Decision.Allowed) revert PolicyViolation(decision);
        nonces[intent.agent]++;
        lifetimeSpent[intent.agent] += intent.amount;
        dailySpent[intent.agent][currentDay()] += intent.amount;
        globalDailySpent[currentDay()] += intent.amount;
        delete approvals[digest];
        delete _pendingIntents[intent.agent];
        delete _pendingSignatures[intent.agent];
        _transferExact(intent.recipient, intent.amount);
        emit SpendExecuted(digest, intent.agent, intent.recipient, intent.amount, intent.nonce, intent.memo);
    }

    /// @notice Any funder may deposit; deposited funds become controlled by the vault owner.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidConfiguration();
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert UnsupportedTokenBehavior();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Owner exit is available even when agent spending is paused.
    function withdraw(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this) || amount == 0) revert InvalidConfiguration();
        _transferExact(recipient, amount);
        emit Withdrawn(recipient, amount);
    }

    function recoverToken(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(asset) || token.code.length == 0 || recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        IERC20(token).safeTransfer(recipient, amount);
        emit TokenRecovered(token, recipient, amount);
    }

    function recoverNative(address payable recipient) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert InvalidConfiguration();
        uint256 amount = address(this).balance;
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
        emit NativeRecovered(recipient, amount);
    }

    function _transferExact(address recipient, uint256 amount) private {
        uint256 vaultBefore = asset.balanceOf(address(this));
        uint256 recipientBefore = asset.balanceOf(recipient);
        asset.safeTransfer(recipient, amount);
        uint256 vaultAfter = asset.balanceOf(address(this));
        uint256 recipientAfter = asset.balanceOf(recipient);
        if (
            vaultAfter > vaultBefore || vaultBefore - vaultAfter != amount || recipientAfter < recipientBefore
                || recipientAfter - recipientBefore != amount
        ) revert UnsupportedTokenBehavior();
    }
}
