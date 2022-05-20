pragma solidity ^0.5.8;

pragma experimental ABIEncoderV2;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    
    using SafeMath for uint256;

    address private owner;

    bool private isOperational = true;

    struct Airline {
        bool isRegistered;
        string name;
        address wallet;
    }

    struct Insurance {
        Flight flight;
        uint256 value;
        address customer;
    }

    struct Flight {
        string name;
        bool isRegistered;
        address airline;
        uint statusCode;
        uint256 timestamp;
    }

    uint private registredAirlineCount = 0;                           

    uint private countOfInsurancePurchased = 0;                         

    mapping(bytes32 => Flight) private flightsMap;                

    bytes32[] private flightKeys = new bytes32[](0);         
    
    mapping(address => Airline) private airlinesMap;               
    
    mapping(uint => Insurance) private insurancesMap;             
    
    address[] private insurees = new address[](0);            
    
    mapping(address => uint256) private payoutsMap;            
    
    mapping(address => uint256) private fundsMap;                 
    
    mapping(address => uint256) private authorizedContractsMap;    

    uint256 public constant MaxInsurancePolicy = 1 ether;   
    
    uint256 public constant AIRLINE_MIN_FUNDS = 10 ether;      

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/
    event InsureeCredited(address insureeAddress, uint credit, uint total);

    event debug(uint i, address insureeAddress, bytes32 key, address airline, string flight, uint256 ftimestamp, uint256 value);

    /**
    * @dev Constructor
    *      The deploying account becomes owner
    */
    constructor() public{
        owner = msg.sender;
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
    * @dev Modifier that requires the "isOperational" boolean variable to be "true"
    *      This is used on all state changing functions to pause the contract in
    *      the event there is an issue that needs to be fixed
    */
    modifier requireIsisOperational(){
        require(isOperational, "Contract is currently not isOperational");
        _;
    }

    /**
    * @dev Modifier that requires the "ContractOwner" account to be the function caller
    */
    modifier requireContractOwner(){
        require(msg.sender == owner, "Caller is not contract owner");
        _;
    }

    /**
    * @dev Modifier that checks whether it is called from authorized (FlightSuretyApp) contract
    */
    modifier isCallerAuthorized() {
        require(authorizedContractsMap[msg.sender] == 1, "Caller is not authorized");
        _;
    }

    /**
    * @dev Define a modifier that checks if the paid amount is sufficient to cover the price
    */
    modifier paidInRange() {
        require(msg.value >= 0, "Nothing was paid for the insurance");
        _;
    }

    /**
    * @dev Define a modifier that checks the price and refunds the remaining balance
    */
    modifier checkAndRefund(address insureeAddress) {
        _;
        if (msg.value > MaxInsurancePolicy) {
            uint payout = msg.value.sub(MaxInsurancePolicy);
            
            payoutsMap[insureeAddress] = payoutsMap[insureeAddress].add(payout);
            
            emit InsureeCredited(insureeAddress, payout, payoutsMap[insureeAddress]);
        }
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
    * @dev Get operating status of contract
    * @return A bool that is the current operating status
    */
    function isisOperational() public view returns (bool){
        return isOperational;
    }


    /**
    * @dev Sets contract operations on/off
    * When isOperational mode is disabled, all write transactions except for this one will fail
    */
    function setOperatingStatus(bool mode) external requireContractOwner{
        isOperational = mode;
    }

    /**
    * @dev To authorize contract (this function can be requested from front-end)
    */
    function authorizeCaller(address caller) public requireContractOwner {
        require(authorizedContractsMap[caller] == 0, "Address already authorized");
       
        authorizedContractsMap[caller] = 1;
    }

    /**
    * @dev To deauthorize contract
    */
    function deauthorizeCaller(address caller) public requireContractOwner {
        require(authorizedContractsMap[caller] == 1, "Address was not authorized");
       
        authorizedContractsMap[caller] = 0;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
     * @dev Add an airline to the registration queue
     *      Can only be called from FlightSuretyApp contract
     */
    function registerAirline(string name, address wallet) external isCallerAuthorized{
        require(!airlinesMap[wallet].isRegistered, "Airline is already isRegistered.");
        
        airlinesMap[wallet] = Airline({name : name, isRegistered : true, wallet : wallet});
        
        registredAirlineCount = registredAirlineCount.add(1);
    }

    /**
    * @dev To get the number of airlinesMap isRegistered
    */
    function getAirlineCount() public view returns (uint256) {
        return registredAirlineCount;
    }

    /**
    * @dev To get the information about the specific airline (this function can be requested from front-end)
    */
    function getFlights() external view returns (string[] memory, address[] memory, uint256[] memory) {
        uint flightKeyLength = flightKeys.length;
        
        string[] memory names = new string[](flightKeyLength);
        
        address[] memory airlineAddress = new address[](flightKeyLength);
        
        uint256[] memory timestamps = new uint256[](flightKeyLength);

        for (uint i = 0; i < flightKeyLength; ++i) {
            bytes32 key = flightKeys[i];
            
            names[i] = flightsMap[key].name;
            
            airlineAddress[i] = flightsMap[key].airline;
            
            timestamps[i] = flightsMap[key].timestamp;
        }
        return (names, airlineAddress, timestamps);
    }

    /**
    * @dev To check whether the specific airline is isRegistered
    */
    function isAirlineRegistered(address wallet) external view returns (bool) {
        return airlinesMap[wallet].isRegistered;
    }

    /**
    * @dev To check whether the specific airline meets the minimum fundsMap requirement
    */
    function isAirlineFunded(address wallet) external view returns (bool) {
        return fundsMap[wallet] >= AIRLINE_MIN_FUNDS;
    }

    /**
    * @dev To check whether the specific flight is already isRegistered
    */
    function isFlightRegistered(string memory name, uint256 timestamp, address airline) public view returns (bool) {
        bytes32 key = getFlightKey(airline, name, timestamp);
        
        return flightsMap[key].isRegistered;
    }

    /**
    * @dev To register flightsMap
    */
    function registerFlight(string name, uint256 timestamp, address airline) external isCallerAuthorized {
        bool isRegistered = isFlightRegistered(name, timestamp, airline);
        
        require(!isRegistered, "Flight is already isRegistered");
        
        bytes32 key = getFlightKey(airline, name, timestamp);
        require(!flightsMap[key].isRegistered, "Flight is already isRegistered.");
        
        flightsMap[key].name = name;
        flightsMap[key].isRegistered = true;
        flightsMap[key].airline = airline;
        flightsMap[key].statusCode = 0;
        flightsMap[key].timestamp = timestamp;
        flightKeys.push(key);
    }

    /**
     * @dev To buy insurance for a flight
     */
    function buy(string calldata flight, uint256 timestamp, address airline, address insureeAddress) external payable isCallerAuthorized paidInRange checkAndRefund(insureeAddress){
        bytes32 key = getFlightKey(airline, flight, timestamp);
        require(flightsMap[key].isRegistered, "Flight does not exist");

        uint insurance_value = 0;

        if (msg.value >= MaxInsurancePolicy) {
            insurance_value = MaxInsurancePolicy;
        } else {
            insurance_value = msg.value;
        }

        insurancesMap[countOfInsurancePurchased].flight = flightsMap[key];
        insurancesMap[countOfInsurancePurchased].customer = insureeAddress;
        insurancesMap[countOfInsurancePurchased].value = insurance_value;
        countOfInsurancePurchased = countOfInsurancePurchased.add(1);
        insurees.push(insureeAddress);
    }

    /**
     *  @dev Credits payoutsMap to insurees
    */
    function creditInsurees(string calldata flight, uint256 timestamp, address airline)external{
        bytes32 key = getFlightKey(airline, flight, timestamp);
        for (uint i = 0; i < insurees.length; ++i) {
            address insureeAddress = insurancesMap[i].customer;
            bytes32 currentFlightKey = getFlightKey(insurancesMap[i].flight.airline, insurancesMap[i].flight.name, insurancesMap[i].flight.timestamp);
            
            emit debug(i, insurancesMap[i].customer, key, airline, flight, timestamp, 0);
            emit debug(i, insurancesMap[i].customer, currentFlightKey, insurancesMap[i].flight.airline, insurancesMap[i].flight.name, insurancesMap[i].flight.timestamp, insurancesMap[i].value);
            
            if(insurancesMap[i].value == 0) continue;
            if (key == currentFlightKey) {
                uint256 value = insurancesMap[i].value;
                uint256 half = value.div(2);
                insurancesMap[i].value = 0;
                uint256 refund = value.add(half);
                payoutsMap[insureeAddress] = payoutsMap[insureeAddress].add(refund);
                emit InsureeCredited(insureeAddress, refund, payoutsMap[insureeAddress]);
            }
        }
    }

    /**
    * @dev To check any fundsMap owed to the passenger
    */
    function checkFunds(address insureeAddress) external view returns (uint){
        return payoutsMap[insureeAddress];
    }

    /**
    *  @dev Transfers eligible payout fundsMap to insureeAddress
    */
    function pay(address payable insureeAddress) external isCallerAuthorized{
        uint refund = payoutsMap[insureeAddress];
        payoutsMap[insureeAddress] = 0;
        insureeAddress.transfer(refund);
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flightsMap
     *      resulting in insurance payoutsMap, the contract should be self-sustaining
     */
    function fundForwarded(address sender) external payable isCallerAuthorized{
        require(msg.value > 0, "No fundsMap are not allowed");
        fundsMap[sender] = fundsMap[sender].add(msg.value);
    }

    /**
    * @dev To generate flight key in hash by airline, flight, and timestamp
    */
    function getFlightKey(address airline,string memory flight,uint256 timestamp) pure internal returns (bytes32){
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

    /**
    * @dev Fallback function for funding smart contract.
    */
    function()external payable{
        require(msg.value > 0, "No fundsMap are not allowed");
        fundsMap[msg.sender] = fundsMap[msg.sender].add(msg.value);
    }
}