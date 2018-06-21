# Introduction

## DUO Network Token Contract
Standard ERC20 Token with 18 decimal places 
## Token A Contract
ERC20 Token wrapper with 18 decimal places. The ERC20 functions are redirected to Custodian Contract, which implements the actual logic for Token A.
## Token B Contract
ERC20 Token wrapper with 18 decimal places. The ERC20 functions are redirected to Custodian Contract, which implements the actual logic for Token B.
## Custodian Contract
Main contract implementing the DUO structure.

# How to run test
1. clone the depository and install all dependencies

```npm install```

2. start ganache locally

```npm start```

3. in a different terminal

```npm test```

Copyrights © 2017-18 FinBook. All Rights Reserved. 
