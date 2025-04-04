// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.28;

import "./WorldIDVerifier.sol";
import "./EventTicketingApp.sol";
import "./EventTicketNFT.sol";
import "./EventTicketPayment.sol";
import "./CrossChainPaymentBridge.sol";

/**
 * @title Deployer
 * @dev Contract to deploy and set up the entire ticketing system
 */
contract Deployer {
    // Deployed contract addresses
    WorldIDVerifier public worldIDVerifier;
    EventTicketingApp public ticketingApp;
    EventTicketNFT public ticketNFT;
    EventTicketPayment public paymentProcessor;
    CrossChainPaymentBridge public crossChainBridge;
    
    // Owner address (platform admin)
    address public owner;
    
    // Events
    event DeploymentComplete(
        address worldIDVerifier,
        address ticketingApp,
        address ticketNFT,
        address paymentProcessor,
        address crossChainBridge
    );
    
    /**
     * @dev Deploys and sets up all contracts
     * @param _owner Address that will own all contracts
     * @param _platformFeeAddress Address to receive platform fees
     */
    function deploy(address _owner, address _platformFeeAddress) external {
        owner = _owner;
        
        // Deploy World ID Verifier
        worldIDVerifier = new WorldIDVerifier();
        worldIDVerifier.transferOwnership(owner);
        
        // Deploy main ticketing app
        ticketingApp = new EventTicketingApp(address(worldIDVerifier), _platformFeeAddress);
        ticketingApp.transferOwnership(owner);
        
        // Deploy NFT contract
        ticketNFT = new EventTicketNFT("Event Ticket NFT", "TICKET");
        ticketNFT.transferOwnership(owner);
        
        // Deploy payment processor
        paymentProcessor = new EventTicketPayment();
        paymentProcessor.transferOwnership(owner);
        
        // Deploy cross-chain bridge
        crossChainBridge = new CrossChainPaymentBridge();
        crossChainBridge.transferOwnership(owner);
        
        // Configure contracts to work together
        ticketNFT.setTicketingApp(address(ticketingApp));
        paymentProcessor.setTicketingApp(address(ticketingApp));
        ticketingApp.setContracts(address(ticketNFT), address(paymentProcessor));
        crossChainBridge.setTicketingApp(address(ticketingApp));
        crossChainBridge.setPaymentProcessor(address(paymentProcessor));
        
        emit DeploymentComplete(
            address(worldIDVerifier),
            address(ticketingApp),
            address(ticketNFT),
            address(paymentProcessor),
            address(crossChainBridge)
        );
    }
}