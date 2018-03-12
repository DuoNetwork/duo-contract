pragma solidity ^0.4.17;

contract calculator{
    
    Math m = new Math();
    
    function squarevalue(int s) public returns(int){
        return m.square(s);
    }
    
    function multiplication(int first, int second) public returns(int){
        return m.multiply(first, second);
    }
}

contract Math{
    
    function square(int s) public pure returns (int) {
        return s*s;
    }
    
    function multiply(int first, int second) public pure returns (int){
        return first * second;
    }
}