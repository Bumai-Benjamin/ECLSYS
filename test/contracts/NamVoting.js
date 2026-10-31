const NamVoting = artifacts.require('NamVoting');
const assert = require('assert');

contract('NamVoting', (accounts) =>{
    const ADMIN = accounts[0];
    
    it('Should allow Adding og Candidates', async() => {
        const instance = await NamVoting.deployed();
        
        await instance.addContestant("Dr Nujoma", "POS", 65, "PHD");

        const candCount = await instance.contestantsCount();

        assert.equal(candCount, 1,'The Candidate added');
    });
});