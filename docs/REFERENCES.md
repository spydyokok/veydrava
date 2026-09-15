# Implementation references

The project was written independently; these primary sources informed the design and integration API checks.

- Reference product: https://spenda-delta.vercel.app/
- Reference author's architecture README (conceptual comparison): https://github.com/Saber1Y/Spenda
- OpenZeppelin cryptography (EIP-712, ECDSA, SignatureChecker): https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography
- OpenZeppelin ERC20 / SafeERC20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20
- Solidity security considerations: https://docs.soliditylang.org/en/latest/security-considerations.html
- ethers v6 providers and wallet integration: https://docs.ethers.org/v6/api/providers/
- Ollama local structured outputs: https://docs.ollama.com/capabilities/structured-outputs

Installed dependency versions are pinned in package.json and package-lock.json. Contract bytecode is generated with the pinned solc package. Third-party code retains its own licenses, including the existing Shadcn notices.
