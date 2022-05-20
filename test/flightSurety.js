const Test = require('../config/testConfig.js');
const truffleAssert = require('truffle-assertions');
const BN = require('bn.js');

let InitialFund = 0;
let MaxInsurancePolicy = 0;

contract('Flight Surety Tests', async (accounts) => {

    let config;
    before('setup contract', async () => {
        config = await Test.Config(accounts);

        await config.flightSuretyData.authorizeCaller(config.flightSuretyApp.address);
        InitialFund = await config.flightSuretyData.AIRLINE_MIN_FUNDS.call();
        MaxInsurancePolicy = await config.flightSuretyData.MAX_INSURANCE_POLICY.call();

        await config.flightSuretyApp.sendTransaction({ from: config.firstAirline, value: InitialFund });
        await config.flightSuretyApp.registerAirline('Root Air', config.firstAirline, { from: config.owner });
    });


    it(`(multiparty) has correct initial isOperational() value`, async function () {
        // Get operating status
        let status = await config.flightSuretyData.isOperational.call();

        assert.equal(status, true, "Incorrect initial operating status value");
    });

    it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {
        // Ensure that access is denied for non-Contract Owner account
        let isAccessDenied = false;
        try {
            await config.flightSuretyData.setOperatingStatus(false, { from: config.testAddresses[2] });
        } catch (e) {
            isAccessDenied = true;
        }

        assert.equal(isAccessDenied, true, "Access not restricted to Contract Owner");
    });

    it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {
        // Ensure that access is allowed for Contract Owner account
        let accessDenied = false;
        try {
            await config.flightSuretyData.setOperatingStatus(false);
        } catch (e) {
            accessDenied = true;
        }

        assert.equal(accessDenied, false, "Access not restricted to Contract Owner");
    });

    it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {
        await config.flightSuretyData.setOperatingStatus(false);

        let reverted = false;
        try {
            await config.flightSurety.setTestingMode(true);
        } catch (e) {
            reverted = true;
        }
        assert.equal(reverted, true, "Access not blocked for requireIsOperational");

        // Set it back for other tests to work
        await config.flightSuretyData.setOperatingStatus(true);
    });

    it('(airline) cannot register an Airline using registerAirline() if it is not funded', async () => {
        let newAirlineAddress = accounts[2];
        let failAirlineAddress = accounts[99];
        try {
            await config.flightSuretyApp.registerAirline("My Airline", newAirlineAddress, { from: config.firstAirline });
        } catch (e) {

        }
        let result = await config.flightSuretyData.isAirlineRegistered.call(newAirlineAddress);

        assert.equal(result, true, "Airline should be registered");
        result = await config.flightSuretyData.isAirlineFunded.call(newAirlineAddress);
        assert.equal(result, false, "Airline should not be funded");
        try {
            await config.flightSuretyApp.registerAirline("My Airline", failAirlineAddress, { from: newAirlineAddress });
        } catch (e) { }
        result = await config.flightSuretyData.isAirlineRegistered.call(failAirlineAddress);
        assert.equal(result, false, "Unfunded airline should not be able to register new airline");
    });

    it("First airline is registered when contract is deployed", async () => {
        let result = await config.flightSuretyData.isAirlineRegistered.call(config.firstAirline);
        assert.equal(result, true, "First Airline should always be registered");
    });

    it("Only existing airline may register a new airline until there are at least four airlines registered", async () => {
        const accountOffsetCound = 4; // start with 3 because  1 and 2 are already in use (use clean address)
        const maxAirlinesCount = 2; // four minus two which are already registered

        for (let i = 0; i < maxAirlinesCount; ++i) {
            try {
                await config.flightSuretyApp.sendTransaction({ from: accounts[i + accountOffsetCound], value: InitialFund });
                await config.flightSuretyApp.registerAirline("My Airline", accounts[i + accountOffsetCound], { from: config.firstAirline });
            } catch (e) {
                console.log(e)
            }
            let result = await config.flightSuretyData.isAirlineRegistered.call(accounts[i + accountOffsetCound]);
            assert.equal(result, i < maxAirlinesCount, "Airline should not be able to register another airline until there are at least four airlines registered");
        }
    });

    it("Registration of fifth and subsequent airlines requires multi-party consensus of 50% of registered airlines", async () => {
        const accountOffetCount = 6; // account_offset + max_airlines of previous test (aligned)
        const voteOffsetCount = 4; // account_offset of previous test
        const maxAirlinesCount = 10;

        for (let i = 0; i < maxAirlinesCount; ++i) {
            await config.flightSuretyApp.sendTransaction({ from: accounts[i + accountOffetCount], value: InitialFund });
            let count = new BN(await config.flightSuretyData.getAirlineCount.call());
            let votesRequiredCount = Math.ceil(count / 2);
            for (let k = 0; k < votesRequiredCount; ++k) {
                try {
                    await config.flightSuretyApp.registerAirline("My Airline", accounts[i + accountOffetCount], { from: accounts[k + voteOffsetCount] });
                } catch (e) {
                    console.log(e)
                }
                let result = await config.flightSuretyData.isAirlineRegistered.call(accounts[i + accountOffetCount]);
                assert.equal(result, k === (votesRequiredCount - 1), "multi-party consensus failed");
            }
        }
    });

    it("Airline can be registered, but does not participate in contract until it submits funding of 10 ether", async () => {
        //see previous tests
        let unfundedAirlineAddress = accounts[2];
        let newAirlineAddress = accounts[97];
        let funded = await config.flightSuretyData.isAirlineFunded.call(unfundedAirlineAddress);

        assert.equal(funded, false, "Airline should be unfunded");
        let pass;
        try {
            await config.flightSuretyApp.registerAirline("New airline", newAirlineAddress, { from: unfundedAirlineAddress });
            pass = true;
        } catch (e) {
            pass = false;
        }
        assert.equal(pass, false, "Airline should not be able to participate without funding");
    });

    it("Register Flight", async () => {
        for (let i = 0; i < 10; ++i) {
            let airlineAddress = accounts[i];
            let name = "Flight " + i;
            let timestamp = 12345678;

            await config.flightSuretyApp.sendTransaction({ from: airlineAddress, value: InitialFund });
            let funded = await config.flightSuretyData.isAirlineFunded.call(airlineAddress);
            assert.equal(funded, true, "Airline should be funded");
            let reg = await config.flightSuretyData.isFlightRegistered(name, timestamp, airlineAddress, { from: airlineAddress });
            assert.equal(reg, false, "Flight is already registered");
            await config.flightSuretyApp.registerFlight(name, timestamp, airlineAddress, { from: airlineAddress });
            let pass = await config.flightSuretyData.isFlightRegistered(name, timestamp, airlineAddress, { from: airlineAddress });
            assert.equal(pass, true, "Airline should be able to Register a flight");
        }
    });

    it("Passengers may pay up to 1 ether for purchasing flight insurance.", async () => {
        let airlineAddress = accounts[12];
        let customerAddress = accounts[99];
        let timestamp = 12345678;
        let insurance_values = [
            new BN(web3.utils.toWei('2', "ether")),
            new BN(web3.utils.toWei('0.1', "ether")),
            new BN(web3.utils.toWei('1', "ether")),
            new BN(web3.utils.toWei('20', "ether")),
            new BN(web3.utils.toWei('0.0001', "ether")),
            new BN(web3.utils.toWei('0.0000000000001', "ether")),
            new BN(web3.utils.toWei('1', "wei")),
        ];

        for (var i = 0, len = insurance_values.length; i < len; i++) {
            let name = "Flight " + i;
            let insuranceValue = insurance_values[i];
            let overpaidAmount = new BN('0');
            if (insuranceValue.gt(MaxInsurancePolicy)) {
                overpaidAmount = insuranceValue.sub(MaxInsurancePolicy);
            }
            let tx = await config.flightSuretyApp.buyInsurance(name, timestamp, accounts[i], {
                from: customerAddress,
                value: insuranceValue
            });
            let newTx = await truffleAssert.createTransactionResult(config.flightSuretyData, tx.tx);

            if (overpaidAmount > 0) {
                truffleAssert.eventEmitted(newTx, 'InsureeCredited', null, 'InsureeCredited should be emitted at all');
                truffleAssert.eventEmitted(newTx, 'InsureeCredited', (ev) => {
                    return ev.insuree === customerAddress && ev.credit.eq(overpaidAmount);
                }, 'InsureeCredit emited wrong parameters');
            } else {
                truffleAssert.eventNotEmitted(newTx, 'InsureeCredited', null, 'Insuree should not gain any credit');
            }
        }
    }
    );

    it("If flight is delayed due to airline fault, passenger receives credit of 1.5X the amount they paid", async () => {
        let airlineAddress = accounts[7];
        let customerAddress = accounts[55];
        let name = "Flight " + 7;
        let timestamp = 12345678;
        let minResponsesCount = await config.flightSuretyApp.MIN_RESPONSES.call();
        let insuranceValue = new BN(web3.utils.toWei('10', "ether"));
        let expectedPayout;

        if (insuranceValue.gt(MaxInsurancePolicy)) {
            expectedPayout = MaxInsurancePolicy.add(MaxInsurancePolicy.div(new BN(2)));
        } else {
            expectedPayout = insuranceValue.add(insuranceValue.div(new BN(2)));
        }

        let tx = await config.flightSuretyApp.buyInsurance(name, timestamp, airlineAddress, {
            from: customerAddress,
            value: insuranceValue
        });

        let TEST_ORACLES_COUNT = 30;

        // ARRANGE
        let fee = await config.flightSuretyApp.REGISTRATION_FEE.call();

        // ACT
        for (let a = 1; a < TEST_ORACLES_COUNT; a++) {
            await config.flightSuretyApp.registerOracle({ from: accounts[a], value: fee });
            let result = await config.flightSuretyApp.getMyIndexes.call({ from: accounts[a] });
        }

        tx = await config.flightSuretyApp.fetchFlightStatus(airlineAddress, name, timestamp);
        truffleAssert.eventEmitted(tx, 'OracleRequest', { airline: airlineAddress, flight: name });

        let success_responses = 0;

        for (let a = 1; a < TEST_ORACLES_COUNT; a++) {
            // Get oracle information
            let oracleIndexes = await config.flightSuretyApp.getMyIndexes.call({ from: accounts[a] });
            for (let idx = 0; idx < 3; idx++) {
                let tx;
                try {
                    // Submit a response...it will only be accepted if there is an Index match
                    tx = await config.flightSuretyApp.submitOracleResponse(oracleIndexes[idx], airlineAddress, name, timestamp, 20, { from: accounts[a] });
                } catch (e) {
                    continue;
                    // Enable this when debugging
                    // console.log('\nError', idx, oracleIndexes[idx].toNumber(), flight, timestamp);
                }

                let tx_data = await truffleAssert.createTransactionResult(config.flightSuretyData, tx.tx);
                truffleAssert.eventEmitted(tx, 'OracleReport');
                success_responses += 1;
                console.log("Success Responses: %d", success_responses);
                if (success_responses >= 3) {
                    truffleAssert.eventEmitted(tx, 'FlightStatusInfo');
                    truffleAssert.eventEmitted(tx_data, 'InsureeCredited', null, 'InsureeCredited was not emitted');
                    truffleAssert.eventEmitted(tx_data, 'InsureeCredited', (ev) => {
                        console.log("Event Credit: %d", web3.utils.fromWei(ev.credit.toString(), 'ether'));
                        console.log("Expected Payout: %d", web3.utils.fromWei(expectedPayout.toString(), 'ether'));
                        return ev.insuree === customerAddress && ev.credit.eq(expectedPayout);
                    }, 'InsureeCredit emited wrong parameters');
                    return;
                }

            }
        }
        assert.equal(false, true, 'Should never reach this');
    });

    it("Passenger can withdraw any funds owed to them as a result of receiving credit for insurance payout", async () => {
        let customerAccount = accounts[55];
        let balance = web3.utils.fromWei(await web3.eth.getBalance(customerAccount), 'ether');
        let funds = web3.utils.fromWei(await config.flightSuretyData.checkFunds(customerAccount), 'ether');
        let tx = await config.flightSuretyApp.getFunds({ from: customerAccount });
        let new_balance = web3.utils.fromWei(await web3.eth.getBalance(customerAccount), 'ether');

        console.log("Passenger fund is %d", funds);
        console.log("Balance is %d", balance);
        console.log("New Balance is %d", new_balance);
        console.log("Withdrew %d", new_balance - balance);

        // To compare result, change variable type from string to float so it can return bool properly
        assert.equal(parseFloat(new_balance) > parseFloat(balance), true, 'New balance should be bigger');
    });
});