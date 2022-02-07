// SPDX-License-Identifier: MIT
pragma solidity 0.8.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

struct SaleConfig {
  uint32 txLimit;
  uint32 supplyLimit;
}

contract BasicNFT is Ownable, ERC721 {
  using SafeCast for uint256;
  using SafeMath for uint256;

  uint256 public constant mintPrice = 0.045 ether;

  uint256 public totalSupply = 0;

  SaleConfig public saleConfig;

  string public baseURI;

  bool public saleActive = false;

  mapping(address => uint256) private presaleMinted;

  address payable public withdrawalAddress;

  address private devAddress = 0x08cBe2A6548b47299158c7a8Ed5D147051537dF0;
  uint256 private devPercent = 8;

  constructor(string memory inputBaseUri) ERC721("Basic NFT", "NFT") {
    baseURI = inputBaseUri;
    saleConfig = SaleConfig({ txLimit: 10, supplyLimit: 10000 });
  }

  function _baseURI() internal view override returns (string memory) {
    return baseURI;
  }

  function setBaseURI(string calldata newBaseUri) external onlyOwner {
    baseURI = newBaseUri;
  }

  function setSaleActive(bool saleIsActive) external onlyOwner {
    saleActive = saleIsActive;
  }

  function configureSales(uint256 txLimit, uint256 supplyLimit)
    external
    onlyOwner
  {
    uint32 _txLimit = txLimit.toUint32();
    uint32 _supplyLimit = supplyLimit.toUint32();

    saleConfig = SaleConfig({ txLimit: _txLimit, supplyLimit: _supplyLimit });
  }

  function buy(uint256 numberOfTokens) external payable {
    require(saleActive, "Sale is not active");
    require(numberOfTokens <= saleConfig.txLimit, "Transaction limit exceeded");
    require(msg.value == (mintPrice * numberOfTokens), "Incorrect payment");

    mint(msg.sender, numberOfTokens);
  }

  function mint(address to, uint256 numberOfTokens) private {
    require(
      (totalSupply + numberOfTokens) <= saleConfig.supplyLimit,
      "Not enough tokens left"
    );

    uint256 newId = totalSupply;

    for (uint256 i = 0; i < numberOfTokens; i++) {
      newId += 1;
      _safeMint(to, newId);
    }

    totalSupply = newId;
  }

  function reserve(address to, uint256 numberOfTokens) external onlyOwner {
    mint(to, numberOfTokens);
  }

  function withdraw() external onlyOwner {
    require(address(this).balance > 0, "No balance to withdraw.");

    uint256 devShare = address(this).balance.mul(devPercent).div(100);

    (bool success, ) = devAddress.call{ value: devShare }("");
    require(success, "Withdrawal for dev failed.");

    (success, ) = msg.sender.call{ value: address(this).balance }("");
    require(success, "Withdrawal for owner failed.");
  }
}
