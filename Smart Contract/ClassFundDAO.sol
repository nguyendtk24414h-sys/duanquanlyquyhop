// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
    OpenZeppelin Contracts 5.x
    - ERC20 / ERC721 / AccessControl
    - Phù hợp để chạy trên Remix IDE khi cài gói @openzeppelin/contracts 5.x
*/

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title vVND - token hạch toán quỹ lớp, 1 token = 1 VND
/// @notice Token không thể chuyển nhượng giữa các ví cá nhân.
contract vVNDToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    error ZeroAddress();
    error TransferDisabled();

    constructor(address backendAdmin, address multisigBurner) ERC20("vVND", "VVND") {
        if (backendAdmin == address(0) || multisigBurner == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, backendAdmin);
        _grantRole(MINTER_ROLE, backendAdmin);

        // Admin backend và multisig Safe 2/3 đều có quyền burn
        _grantRole(BURNER_ROLE, backendAdmin);
        _grantRole(BURNER_ROLE, multisigBurner);
    }

    /// @notice 1 vVND = 1 VND, nên để decimals = 0 cho dễ đối chiếu sổ quỹ.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Backend/Oracle chỉ được mint khi webhook VietQR hợp lệ.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
    }

    /// @notice Admin hoặc Multisig Safe được burn khi lệnh chi quỹ đã được duyệt.
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        if (from == address(0)) revert ZeroAddress();
        _burn(from, amount);
    }

    /// @dev Chặn luôn transfer.
    function transfer(address, uint256) public pure override returns (bool) {
        revert TransferDisabled();
    }

    /// @dev Chặn luôn transferFrom.
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert TransferDisabled();
    }

    /// @dev Lớp bảo vệ cuối cùng: mọi luồng chuyển nhượng đều bị chặn ở hook lõi.
    function _update(address from, address to, uint256 value) internal virtual override {
        if (from != address(0) && to != address(0)) revert TransferDisabled();
        super._update(from, to, value);
    }
}

/// @title VOTE - Soulbound Token quyền biểu quyết cho phụ huynh
/// @notice Mỗi phụ huynh chỉ được mint tối đa 1 token. Token không chuyển nhượng.
contract VoteSBT is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error ZeroAddress();
    error AlreadyHasVote(address account);
    error SoulboundToken();

    mapping(address => bool) public hasVote;
    mapping(address => uint256) public voteTokenIdOf;
    uint256 private _nextTokenId = 1;

    constructor(address backendAdmin) ERC721("VOTE", "VOTE") {
        if (backendAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, backendAdmin);
        _grantRole(MINTER_ROLE, backendAdmin);
    }

    /// @notice Mint 1 phiếu cho 1 phụ huynh sau khi backend xác nhận đủ điều kiện.
    function mint(address to) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (hasVote[to]) revert AlreadyHasVote(to);

        hasVote[to] = true;
        tokenId = _nextTokenId++;
        voteTokenIdOf[to] = tokenId;

        // EOA/Web3Auth wallet là trường hợp phổ biến nhất, dùng _mint để tiết kiệm gas.
        _mint(to, tokenId);
    }

    /// @dev Chặn chuyển nhượng trực tiếp.
    function transferFrom(address, address, uint256) public pure override {
        revert SoulboundToken();
    }

    /// @dev Chặn safeTransferFrom (không data).
    function safeTransferFrom(address, address, uint256) public pure override {
        revert SoulboundToken();
    }

    /// @dev Chặn safeTransferFrom (có data).
    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert SoulboundToken();
    }

    /// @dev Chặn luôn cấp quyền approval để tránh UI/Wallet cố chuyển nhượng.
    function approve(address, uint256) public pure override {
        revert SoulboundToken();
    }

    /// @dev Chặn luôn setApprovalForAll.
    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundToken();
    }

    /// @dev Lớp bảo vệ cuối cùng: nếu token đã tồn tại thì không cho mọi luồng update sau mint.
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert SoulboundToken();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
