const { expect, assert } = require("chai");
const { formatEther } = require("ethers/lib/utils");
const { ethers } = require("hardhat");

describe("NFT contract", function () {
  let Factory;
  let Contract;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  var mintPrice = ethers.utils.parseEther("0.045");
  var supplyLimit = 10000;
  let baseUri = "http://url.com/api/"

  const initialSetup = async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
  }

  const deployContract = async () => {
    Factory = await ethers.getContractFactory("BasicNFT");

    Contract = await Factory.deploy(
      baseUri
    );

    await Contract.deployed();
  }

  before(initialSetup);

  describe("Deployment", function () {
    before(deployContract);

    it("Should set the right owner", async function () {
      expect(await Contract.owner()).to.equal(owner.address);
    });

    it("Should set the right sale config", async function () {
      let saleConfig = await Contract.saleConfig();

      expect(saleConfig.supplyLimit).to.equal(supplyLimit);
      expect(saleConfig.txLimit).to.equal(10);
    });

    it("Should set the mint price to 0.045 eth", async function () {
      expect(await Contract.mintPrice()).to.equal(mintPrice);
    });

    it("Should initially have 0 tokens minted", async function () {
      expect(await Contract.totalSupply()).to.equal(0);
    });
  });

  describe("Changing settings", function () {
    beforeEach(deployContract);

    it("Should allow contract owner to set token base uri", async function () {
      let url = "http://new.url/api/";

      await Contract.connect(owner).setBaseURI(url);

      expect(await Contract.connect(owner).baseURI()).to.equal(url);
    });

    it("Should fail if others try to set token base uri", async function () {
      let url = "http://new.url/api/";

      await expect(Contract.connect(addr1).setBaseURI(url)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow owner to change the sale config", async function () {
      let newSupplyLimit = 9000;
      let newTxLimit = 10;

      await Contract.connect(owner).configureSales(
        newTxLimit,
        newSupplyLimit,
      );

      let saleConfig = await Contract.saleConfig();

      expect(saleConfig.supplyLimit).to.equal(9000);
      expect(saleConfig.txLimit).to.equal(10);
    });

    it("Should not allow any others to change the sale config", async function () {
      let newSupplyLimit = 9000;
      let newTxLimit = 10;

      expect(Contract.connect(addr1).configureSales(
        newTxLimit,
        newSupplyLimit,
      )).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow owner to toggle sale active state", async function () {
      expect(await Contract.connect(addr1).saleActive()).to.equal(false);
      await Contract.connect(owner).setSaleActive(true);
      expect(await Contract.connect(addr1).saleActive()).to.equal(true);
    });
  
    it("Should not allow non-owner to toggle sale active state", async function () {
      expect(Contract.connect(addr1).setSaleActive(true)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  
  });

  describe("Public sales", function () {
    beforeEach(deployContract);

    it("Should fail to allow public mint if toggle off", async function () {
      await expect(Contract.connect(addr1).buy(1, {value: mintPrice})).to.be.revertedWith("Sale is not active");
    });

    it("Should allow any wallet to mint during public sale", async function () {
      await Contract.connect(owner).setSaleActive(true);

      await Contract.connect(addr1).buy(1, {value: mintPrice});
      await Contract.connect(addr2).buy(2, {value: mintPrice.mul(2)});
      await Contract.connect(addrs[0]).buy(3, {value: mintPrice.mul(3)});
      await Contract.connect(addrs[4]).buy(4, {value: mintPrice.mul(4)});

      expect(await Contract.balanceOf(addrs[0].address)).to.equal(3);
      expect(await Contract.totalSupply()).to.equal(10);
    });

    it("Should enforce transaction limit for public sale", async function () {
      await Contract.connect(owner).setSaleActive(true);
      await Contract.connect(addr1).buy(1, {value: mintPrice});
      await Contract.connect(addr1).buy(7, {value: mintPrice.mul(7)});
      await Contract.connect(addr2).buy(10, {value: mintPrice.mul(10)});

      expect(await Contract.totalSupply()).to.equal(18);
      await expect(Contract.connect(addr1).buy(11, {value: mintPrice.mul(21)})).to.be.revertedWith('Transaction limit exceeded');
      await expect(Contract.connect(addr2).buy(30, {value: mintPrice.mul(30)})).to.be.revertedWith('Transaction limit exceeded');
    });

    it("Should allow public sale minting up to the max supply limit", async function () {
      this.timeout(0);
      await Contract.connect(owner).setSaleActive(true);

      for (let i = 0; i < 200; i++) {
        await Contract.connect(addr1).buy(10, {value: mintPrice.mul(10)});
        await Contract.connect(addr2).buy(10, {value: mintPrice.mul(10)});
        await Contract.connect(addrs[0]).buy(10, {value: mintPrice.mul(10)});
        await Contract.connect(addrs[1]).buy(10, {value: mintPrice.mul(10)});
        await Contract.connect(addrs[2]).buy(10, {value: mintPrice.mul(10)});
      }

      await expect(Contract.connect(addr1).buy(1, {value: mintPrice})).to.be.revertedWith('Not enough tokens left');
      await expect(Contract.connect(addr2).buy(1, {value: mintPrice})).to.be.revertedWith('Not enough tokens left');
      expect(await Contract.connect(owner).totalSupply()).to.equal(10000);
    });

    it("Should require 0.045ETH per token for public sale minting", async function () {
      let sendPrice = mintPrice.sub(1);
      await Contract.connect(owner).setSaleActive(true);

      await expect(Contract.connect(addr1).buy(1, {value: sendPrice})).to.be.revertedWith("Incorrect payment");
      expect(await Contract.connect(owner).totalSupply()).to.equal(0);

      await Contract.connect(addr2).buy(1, {value: mintPrice});
      expect(await Contract.connect(owner).totalSupply()).to.equal(1);

      await Contract.connect(addr1).buy(3, {value: mintPrice.mul(3)});
      expect(await Contract.connect(owner).totalSupply()).to.equal(4);
    });
  });

  describe("Reserving tokens", function () {
    beforeEach(deployContract);

    it("Should allow the owner to reserve tokens without payment", async function () {
      await Contract.connect(owner).reserve(owner.address, 1);
      expect(await Contract.connect(owner).totalSupply()).to.equal(1);
    });

    it("Should not allow anyone else to reserve tokens", async function () {
      await expect(Contract.connect(addr1).reserve(addr1.address, 1)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should be able to reserve 200 tokens at a time", async function () {
      await Contract.connect(owner).reserve(owner.address, 200);
      expect(await Contract.connect(owner).totalSupply()).to.equal(200);
    });

    it("Should allow reserving multiple batches of tokens", async function () {
      await Contract.connect(owner).reserve(owner.address, 20);
      await Contract.connect(owner).reserve(owner.address, 50);
      expect(await Contract.connect(owner).totalSupply()).to.equal(70);
    });

    it("Should allow reserving directly to any wallet", async function () {
      await Contract.connect(owner).reserve(addr1.address, 20);
      await Contract.connect(owner).reserve(addr2.address, 50);

      expect(await Contract.balanceOf(addr1.address)).to.equal(20);
      expect(await Contract.balanceOf(addr2.address)).to.equal(50);
      expect(await Contract.totalSupply()).to.equal(70);
    });

    it("Should not allow reserving tokens beyond the public minting supply limit", async function () {
      this.timeout(0);
      for (let i = 0; i < 99; i++) {
        await Contract.connect(owner).reserve(owner.address, 100);
      }
      await Contract.connect(owner).reserve(addr1.address, 100);

      await expect(Contract.connect(owner).reserve(owner.address, 1)).to.be.revertedWith("Not enough tokens left");
    });
  });

  describe("Withdrawing funds", function () {
    beforeEach(deployContract);

    it("Should allow the contract owner to withdraw", async function () {
      await Contract.connect(owner).setSaleActive(true);
      await Contract.connect(addr1).buy(5, {value: mintPrice.mul(5)});
      await Contract.connect(addr2).buy(5, {value: mintPrice.mul(5)});

      let expectedBalance = mintPrice.mul(10);

      expect(await ethers.provider.getBalance(Contract.address)).to.equal(expectedBalance)
      

      await expect(await Contract.connect(owner).withdraw())
        .to.changeEtherBalances(
          [
            owner,
            Contract
          ],
          [
            expectedBalance.mul(92).div(100),
            ethers.constants.NegativeOne.mul(expectedBalance)
          ]);

      expect(await ethers.provider.getBalance("0x08cBe2A6548b47299158c7a8Ed5D147051537dF0")).to.equal(expectedBalance.mul(8).div(100));
    });

    it("Should fail if there is 0 balance in the contract", async function () {
      await expect(Contract.connect(owner).withdraw()).to.be.revertedWith("No balance to withdraw")
    });
  });
});
