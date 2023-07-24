# feedback

1.  -   For Lack of Input Validation for Liquidation Threshold
        -   USTP are a special lending market that allows liquidation in any case.

2.  -   Reserves MightBe Calculated As 0 Due To Rounding
        -   Will set the reserveFactor. And Small losses are acceptable (<1e3 USDC).

3.  -   convertToUSDC Would Be Calculated Incorrectly If USTP Amount Is Below One
        -   Have designed `repayrUSTP.div(1e12) + 1` to handle the case.

4.  -   Double Protocol Fees Charged
        -   We charge twice, once as an protocol fee and once as an MXP fee.

5.  -   `withdrawUSDC` Can Cause Unexpected Losses
        -   When the user calls `borrowUSDC`, the interest will be calculated.
