[![CircleCI](https://circleci.com/gh/FinBook/duo-contract.svg?style=svg&circle-token=6d0357847fa6cc8078323d1282dcb365e0ad09e8)](https://circleci.com/gh/FinBook/duo-contract)
[![Coverage Status](https://coveralls.io/repos/github/FinBook/duo-contract/badge.svg?branch=master&t=qZnIyS)](https://coveralls.io/github/FinBook/duo-contract?branch=master)
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

# Community Reward
As part of our bounty reward program, any bug or issue found will be rewarded with community tokens based on seriousness of the issue.

# Community
[duo.network](https://duo.network)

[medium](https://medium.com/duo-network)

[telegram](https://t.me/duonetwork)

Copyrights © 2017-18 FinBook. All Rights Reserved. 
