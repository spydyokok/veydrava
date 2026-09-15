// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {VeydravaVault} from "../src/VeydravaVault.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function warp(uint256) external;
    function chainId(uint256) external;
}

contract ContractSigner is IERC1271 {
    bytes32 public accepted;

    function set(bytes32 digest) external {
        accepted = digest;
    }

    function isValidSignature(bytes32 digest, bytes memory) external view returns (bytes4) {
        return digest == accepted ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

contract TaxToken is ERC20 {
    bool public tax;

    constructor() ERC20("Tax", "TAX") {
        _mint(msg.sender, 100_000 ether);
    }

    function enableTax() external {
        tax = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (tax && from != address(0) && to != address(0)) {
            super._update(from, address(0), value / 10);
            super._update(from, to, value - value / 10);
        } else {
            super._update(from, to, value);
        }
    }
}

contract CallbackToken is ERC20 {
    address public target;
    bytes public payload;
    bool public attempted;
    bool public reentered;

    constructor() ERC20("Callback", "CB") {
        _mint(msg.sender, 100_000 ether);
    }

    function arm(address to, bytes memory data) external {
        target = to;
        payload = data;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target != address(0) && from == target && !attempted) {
            attempted = true;
            (reentered,) = target.call(payload);
        }
    }
}

contract VeydravaVaultTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant KEY = 0xA11CE;
    uint256 constant UNIT = 1e6;
    TestUSD token;
    VeydravaVault vault;
    address agent;
    address vendor = address(0xBEEF);
    address stranger = address(0xBAD);

    function setUp() public {
        vm.warp(10 days + 1 hours);
        token = new TestUSD();
        vault = new VeydravaVault(address(this), address(token), 500 * UNIT);
        agent = vm.addr(KEY);
        token.faucet();
        token.approve(address(vault), 10_000 * UNIT);
        vault.deposit(2_000 * UNIT);
        configure(agent, 100 * UNIT, 250 * UNIT, 1_000 * UNIT, 50 * UNIT);
    }

    function configure(address who, uint256 payment, uint256 daily, uint256 lifetime, uint256 threshold) internal {
        vault.setPolicy(who, payment, daily, lifetime, threshold, block.timestamp + 30 days);
        vault.setRecipient(who, vendor, true);
    }

    function intent(uint256 amount) internal view returns (VeydravaVault.SpendIntent memory i) {
        (,,,,, uint256 version,,) = vault.policies(agent);
        i = VeydravaVault.SpendIntent(
            agent,
            vendor,
            amount,
            vault.nonces(agent),
            block.timestamp + 1 hours,
            version,
            vault.authorizationEpoch(),
            keccak256("invoice:42")
        );
    }

    function sign(VeydravaVault.SpendIntent memory i) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY, vault.hashIntent(i));
        return abi.encodePacked(r, s, v);
    }

    function execute(uint256 amount) internal {
        VeydravaVault.SpendIntent memory i = intent(amount);
        vault.executeSpend(i, sign(i));
    }

    function expectPolicy(VeydravaVault.SpendIntent memory i, VeydravaVault.Decision reason) internal {
        bytes memory sig = sign(i);
        vm.expectRevert(abi.encodeWithSelector(VeydravaVault.PolicyViolation.selector, reason));
        vault.executeSpend(i, sig);
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "NOT_EQUAL");
    }

    function testOwnerIsRegistered() public view {
        require(vault.owner() == address(this));
    }

    function testValidSpendAndAccounting() public {
        execute(25 * UNIT);
        assertEq(token.balanceOf(vendor), 25 * UNIT);
        assertEq(vault.nonces(agent), 1);
        assertEq(vault.lifetimeSpent(agent), 25 * UNIT);
        assertEq(vault.dailySpent(agent, vault.currentDay()), 25 * UNIT);
        assertEq(vault.globalDailySpent(vault.currentDay()), 25 * UNIT);
    }

    function testAnyRelayerCanRelayButCannotChangeRecipient() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        vm.prank(stranger);
        vault.executeSpend(i, sig);
        assertEq(token.balanceOf(vendor), 10 * UNIT);
    }

    function testTamperedRecipientFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        i.recipient = stranger;
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.executeSpend(i, sig);
    }

    function testTamperedAmountFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        i.amount = 50 * UNIT;
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.executeSpend(i, sig);
    }

    function testWrongSignerFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, vault.hashIntent(i));
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.executeSpend(i, abi.encodePacked(r, s, v));
    }

    function testEmptySignatureFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.executeSpend(i, hex"");
    }

    function testReplayFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        vault.executeSpend(i, sig);
        vm.expectRevert(abi.encodeWithSelector(VeydravaVault.PolicyViolation.selector, VeydravaVault.Decision.BadNonce));
        vault.executeSpend(i, sig);
    }

    function testCrossChainReplayFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        vm.chainId(1);
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.executeSpend(i, sig);
    }

    function testCrossVaultReplayFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        VeydravaVault other = new VeydravaVault(address(this), address(token), 500 * UNIT);
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        other.executeSpend(i, sig);
    }

    function testDeniedRecipientFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        i.recipient = stranger;
        expectPolicy(i, VeydravaVault.Decision.RecipientDenied);
    }

    function testZeroAmountFails() public {
        expectPolicy(intent(0), VeydravaVault.Decision.ZeroAmount);
    }

    function testExpirationBoundaryFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        vm.warp(i.deadline);
        expectPolicy(i, VeydravaVault.Decision.IntentExpired);
    }

    function testDeadlineCannotOutlivePolicy() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        i.deadline = block.timestamp + 31 days;
        expectPolicy(i, VeydravaVault.Decision.IntentExpired);
    }

    function testAuthorizationExpiryFails() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        vm.warp(block.timestamp + 30 days);
        expectPolicy(i, VeydravaVault.Decision.AgentExpired);
    }

    function testPaymentLimit() public {
        expectPolicy(intent(101 * UNIT), VeydravaVault.Decision.PerPaymentLimit);
    }

    function testThresholdEqualityNeedsNoApproval() public {
        execute(50 * UNIT);
    }

    function testApprovalRequiredAndConsumed() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        expectPolicy(i, VeydravaVault.Decision.ApprovalRequired);
        vault.setIntentApproval(i, true);
        vault.executeSpend(i, sign(i));
        require(!vault.approvals(vault.hashIntent(i)));
    }

    function testApprovalCannotBypassHardCap() public {
        VeydravaVault.SpendIntent memory i = intent(150 * UNIT);
        vm.expectRevert(
            abi.encodeWithSelector(VeydravaVault.PolicyViolation.selector, VeydravaVault.Decision.PerPaymentLimit)
        );
        vault.setIntentApproval(i, true);
    }

    function testApprovalCanBeRevoked() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        vault.setIntentApproval(i, true);
        vault.setIntentApproval(i, false);
        expectPolicy(i, VeydravaVault.Decision.ApprovalRequired);
    }

    function testApprovalIsBoundToExactAmount() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        vault.setIntentApproval(i, true);
        i.amount = 71 * UNIT;
        expectPolicy(i, VeydravaVault.Decision.ApprovalRequired);
    }

    function testDailyLimitAndReset() public {
        for (uint256 n; n < 5; n++) {
            execute(50 * UNIT);
        }
        expectPolicy(intent(1), VeydravaVault.Decision.AgentDailyLimit);
        vm.warp((vault.currentDay() + 1) * 1 days);
        execute(50 * UNIT);
        assertEq(vault.lifetimeSpent(agent), 300 * UNIT);
    }

    function testPolicyEditDoesNotResetDailyOrLifetimeBudget() public {
        for (uint256 n; n < 5; n++) {
            execute(50 * UNIT);
        }
        configure(agent, 100 * UNIT, 250 * UNIT, 1000 * UNIT, 50 * UNIT);
        expectPolicy(intent(1), VeydravaVault.Decision.AgentDailyLimit);
        assertEq(vault.lifetimeSpent(agent), 250 * UNIT);
    }

    function testLifetimeCapSurvivesMidnight() public {
        configure(agent, 100 * UNIT, 100 * UNIT, 100 * UNIT, 100 * UNIT);
        execute(100 * UNIT);
        vm.warp(block.timestamp + 1 days);
        expectPolicy(intent(1), VeydravaVault.Decision.LifetimeLimit);
    }

    function testGlobalCapAcrossAgents() public {
        vault.setGlobalDailyLimit(60 * UNIT);
        execute(50 * UNIT);
        agent = vm.addr(KEY + 1);
        configure(agent, 100 * UNIT, 250 * UNIT, 1000 * UNIT, 100 * UNIT);
        VeydravaVault.SpendIntent memory i = intent(11 * UNIT);
        assertEq(uint256(vault.previewSpend(i)), uint256(VeydravaVault.Decision.VaultDailyLimit));
    }

    function testLoweringGlobalLimitDoesNotUnderflow() public {
        execute(50 * UNIT);
        vault.setGlobalDailyLimit(1);
        expectPolicy(intent(1), VeydravaVault.Decision.VaultDailyLimit);
    }

    function testLoweringDailyLimitDoesNotUnderflow() public {
        execute(50 * UNIT);
        configure(agent, 10 * UNIT, 20 * UNIT, 1000 * UNIT, 10 * UNIT);
        expectPolicy(intent(1), VeydravaVault.Decision.AgentDailyLimit);
    }

    function testInsufficientBalanceFails() public {
        vault.withdraw(address(this), 1999 * UNIT);
        expectPolicy(intent(2 * UNIT), VeydravaVault.Decision.InsufficientBalance);
    }

    function testRevocationAndReactivationDoNotReviveOldSignatures() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        vault.revokeAgent(agent);
        expectPolicy(i, VeydravaVault.Decision.InactiveAgent);
        configure(agent, 100 * UNIT, 250 * UNIT, 1000 * UNIT, 50 * UNIT);
        expectPolicy(i, VeydravaVault.Decision.PolicyChanged);
    }

    function testAllowlistEditInvalidatesOldApprovals() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        vault.setIntentApproval(i, true);
        vault.setRecipient(agent, address(0xF00D), true);
        expectPolicy(i, VeydravaVault.Decision.PolicyChanged);
    }

    function testRevokeAllInvalidatesEveryAgent() public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        vault.revokeAllAgents();
        expectPolicy(i, VeydravaVault.Decision.EpochChanged);
    }

    function testNonceCancellation() public {
        vault.invalidateNonce(agent, 12);
        assertEq(vault.nonces(agent), 12);
        execute(10 * UNIT);
        assertEq(vault.nonces(agent), 13);
    }

    function testPauseStopsSpendAndDepositButAllowsOwnerWithdrawal() public {
        vault.pause();
        expectPolicy(intent(10 * UNIT), VeydravaVault.Decision.VaultPaused);
        vm.expectRevert();
        vault.deposit(1);
        vault.withdraw(address(this), 10 * UNIT);
        vault.unpause();
        execute(10 * UNIT);
    }

    function testUnauthorizedAdminCallsFail() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        vault.pause();
        vm.expectRevert();
        vault.withdraw(stranger, 1);
        vm.expectRevert();
        vault.setPolicy(stranger, 1, 1, 1, 1, block.timestamp + 1 days);
        vm.expectRevert();
        vault.setRecipient(agent, stranger, true);
        vm.expectRevert();
        vault.setGlobalDailyLimit(10_000 * UNIT);
        vm.expectRevert();
        vault.revokeAllAgents();
        vm.stopPrank();
    }

    function testOwnershipTransferIsTwoStepAndInvalidatesAgents() public {
        vault.transferOwnership(stranger);
        require(vault.owner() == address(this));
        vm.prank(stranger);
        vault.acceptOwnership();
        require(vault.owner() == stranger && vault.paused());
        vm.prank(stranger);
        vault.unpause();
        expectPolicy(intent(10 * UNIT), VeydravaVault.Decision.EpochChanged);
    }

    function testRenounceDisabled() public {
        vm.expectRevert(VeydravaVault.RenounceDisabled.selector);
        vault.renounceOwnership();
    }

    function testOwnerCannotBeAgent() public {
        vm.expectRevert(VeydravaVault.InvalidConfiguration.selector);
        vault.setPolicy(address(this), 1, 1, 1, 1, block.timestamp + 1 days);
    }

    function testZeroAssetAndLimitRejected() public {
        vm.expectRevert(VeydravaVault.InvalidConfiguration.selector);
        new VeydravaVault(address(this), address(0), 1);
        vm.expectRevert(VeydravaVault.InvalidConfiguration.selector);
        new VeydravaVault(address(this), address(token), 0);
    }

    function testERC1271Agent() public {
        ContractSigner signer = new ContractSigner();
        agent = address(signer);
        configure(agent, 100 * UNIT, 250 * UNIT, 1000 * UNIT, 50 * UNIT);
        VeydravaVault.SpendIntent memory i = intent(20 * UNIT);
        signer.set(vault.hashIntent(i));
        vault.executeSpend(i, hex"1234");
        assertEq(token.balanceOf(vendor), 20 * UNIT);
    }

    function testFeeOnTransferDepositRejected() public {
        TaxToken tax = new TaxToken();
        VeydravaVault v = new VeydravaVault(address(this), address(tax), 500 ether);
        tax.approve(address(v), 100 ether);
        tax.enableTax();
        vm.expectRevert(VeydravaVault.UnsupportedTokenBehavior.selector);
        v.deposit(100 ether);
        assertEq(tax.balanceOf(address(v)), 0);
    }

    function testFeeOnTransferSpendRollsBackNonceAndBudget() public {
        TaxToken tax = new TaxToken();
        vault = new VeydravaVault(address(this), address(tax), 500 ether);
        tax.approve(address(vault), 2000 ether);
        vault.deposit(2000 ether);
        configure(agent, 100 ether, 250 ether, 1000 ether, 100 ether);
        tax.enableTax();
        VeydravaVault.SpendIntent memory i = intent(10 ether);
        bytes memory sig = sign(i);
        vm.expectRevert(VeydravaVault.UnsupportedTokenBehavior.selector);
        vault.executeSpend(i, sig);
        assertEq(vault.nonces(agent), 0);
        assertEq(vault.lifetimeSpent(agent), 0);
        assertEq(tax.balanceOf(vendor), 0);
    }

    function testReentrantTokenCannotExecuteSecondIntent() public {
        CallbackToken cb = new CallbackToken();
        vault = new VeydravaVault(address(this), address(cb), 500 ether);
        cb.approve(address(vault), 2000 ether);
        vault.deposit(2000 ether);
        configure(agent, 100 ether, 250 ether, 1000 ether, 100 ether);
        VeydravaVault.SpendIntent memory second = intent(10 ether);
        second.nonce = 1;
        bytes memory sig = sign(second);
        cb.arm(address(vault), abi.encodeCall(VeydravaVault.executeSpend, (second, sig)));
        execute(10 ether);
        require(cb.attempted() && !cb.reentered());
        assertEq(vault.nonces(agent), 1);
        assertEq(cb.balanceOf(vendor), 10 ether);
    }

    function testPendingIntentIsDurableAndClearedAfterExecution() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        bytes memory sig = sign(i);
        vault.submitIntent(i, sig);
        (VeydravaVault.SpendIntent memory stored, bytes memory storedSig) = vault.getPendingIntent(agent);
        assertEq(stored.amount, i.amount);
        require(keccak256(storedSig) == keccak256(sig));
        vault.setIntentApproval(i, true);
        vault.executeSpend(i, sig);
        (stored, storedSig) = vault.getPendingIntent(agent);
        require(stored.agent == address(0) && storedSig.length == 0);
    }

    function testForgedPendingIntentRejected() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.submitIntent(i, hex"1234");
    }

    function testRejectClearsPendingAndInvalidatesOldSignature() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        vault.submitIntent(i, sign(i));
        vault.invalidateNonce(agent, 1);
        (VeydravaVault.SpendIntent memory stored,) = vault.getPendingIntent(agent);
        require(stored.agent == address(0));
        expectPolicy(i, VeydravaVault.Decision.BadNonce);
    }

    function testSubmitDoesNotReserveOrMoveFunds() public {
        VeydravaVault.SpendIntent memory i = intent(70 * UNIT);
        vault.submitIntent(i, sign(i));
        assertEq(vault.nonces(agent), 0);
        assertEq(token.balanceOf(vendor), 0);
        assertEq(vault.lifetimeSpent(agent), 0);
    }

    function testBoundedAgentAndRecipientEnumeration() public {
        require(vault.agentCount() == 1 && vault.recipientCount(agent) == 1);
        address[] memory list = vault.getAgents(0, 100);
        require(list.length == 1 && list[0] == agent);
        list = vault.getAgents(1000, 100);
        require(list.length == 0);
        vault.setRecipient(agent, vendor, false);
        vault.setRecipient(agent, vendor, true);
        assertEq(vault.recipientCount(agent), 1);
        vm.expectRevert(VeydravaVault.InvalidConfiguration.selector);
        vault.getAgents(0, 101);
    }

    function testFuzz_NoSpendExceedsHardPaymentLimit(uint256 raw) public {
        uint256 amount = 101 * UNIT + (raw % 1_000_000_000_000);
        expectPolicy(intent(amount), VeydravaVault.Decision.PerPaymentLimit);
        assertEq(vault.nonces(agent), 0);
        assertEq(token.balanceOf(vendor), 0);
    }

    function testFuzz_ValidSpendConservesAssets(uint256 raw) public {
        uint256 amount = 1 + (raw % (50 * UNIT));
        execute(amount);
        assertEq(token.balanceOf(address(vault)) + token.balanceOf(vendor), 2000 * UNIT);
        assertEq(vault.lifetimeSpent(agent), amount);
    }

    function testFuzz_ChangingSignedAmountInvalidatesSignature(uint128 raw) public {
        VeydravaVault.SpendIntent memory i = intent(10 * UNIT);
        bytes memory sig = sign(i);
        i.amount = uint256(raw) + 10 * UNIT + 1;
        vm.expectRevert(VeydravaVault.InvalidSignature.selector);
        vault.executeSpend(i, sig);
    }
}

contract SpendHandler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    VeydravaVault public vault;
    address public owner;
    address public agent;
    address public vendor;
    uint256 public totalPaid;

    constructor(VeydravaVault v, address o, address a, address r) {
        vault = v;
        owner = o;
        agent = a;
        vendor = r;
    }

    function spend(uint256 raw) external {
        (,,,,, uint256 version,,) = vault.policies(agent);
        VeydravaVault.SpendIntent memory i = VeydravaVault.SpendIntent(
            agent,
            vendor,
            raw % 150_000_001,
            vault.nonces(agent),
            block.timestamp + 1 hours,
            version,
            vault.authorizationEpoch(),
            bytes32(0)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xA11CE, vault.hashIntent(i));
        try vault.executeSpend(i, abi.encodePacked(r, s, v)) {
            totalPaid += i.amount;
        }
            catch {}
    }

    function nextDay(uint32 time) external {
        vm.warp(block.timestamp + (uint256(time) % 2 days));
    }

    function updatePolicy() external {
        vm.prank(owner);
        vault.setPolicy(agent, 100e6, 250e6, 1000e6, 100e6, block.timestamp + 30 days);
    }
}

contract VeydravaInvariantTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    VeydravaVault vault;
    TestUSD token;
    SpendHandler handler;
    address agent;
    address vendor = address(0xBEEF);

    function setUp() public {
        vm.warp(10 days);
        agent = vm.addr(0xA11CE);
        token = new TestUSD();
        vault = new VeydravaVault(address(this), address(token), 500e6);
        token.faucet();
        token.approve(address(vault), 2000e6);
        vault.deposit(2000e6);
        vault.setPolicy(agent, 100e6, 250e6, 1000e6, 100e6, block.timestamp + 30 days);
        vault.setRecipient(agent, vendor, true);
        handler = new SpendHandler(vault, address(this), agent, vendor);
    }

    function targetContracts() public view returns (address[] memory result) {
        result = new address[](1);
        result[0] = address(handler);
    }

    function invariant_AssetsAreConserved() public view {
        require(token.balanceOf(address(vault)) + token.balanceOf(vendor) == 2000e6);
    }

    function invariant_BudgetsCannotBeExceeded() public view {
        require(vault.lifetimeSpent(agent) <= 1000e6);
        require(vault.dailySpent(agent, vault.currentDay()) <= 250e6);
        require(vault.globalDailySpent(vault.currentDay()) <= 500e6);
    }

    function invariant_AccountingMatchesActualTransfers() public view {
        require(handler.totalPaid() == token.balanceOf(vendor) && handler.totalPaid() == vault.lifetimeSpent(agent));
    }
}
