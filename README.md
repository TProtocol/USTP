# Interest-bearing ERC20-like token for TProtocol.
-------------

## Designed with three tokens

* rUSTP
    > Main logic contract, it's a collateral lending pool.
    
    > It's a rebasing token.
* iUSTP
    > A non-rebasing ustp, warp from rUSTP.
    
    > The token price will increase with interest.
* USTP
    > A non-rebasing ustp and peg 1$, deposit from rUSTP.

    > Using in Dex.