/**
 * Reading back the figures of a sale that is ALREADY committed.
 *
 * `fmt.money` rejects anything that is not minor units, and rightly so — money is never guessed
 * at. But the sale-done banner and the receipt dialog render from the server's response after the
 * money is in the till, so a figure the response happens not to carry must not throw: the throw
 * lands in React's render and blanks the till, taking the receipt button with it, at the one
 * moment the cashier cannot afford to lose the screen.
 *
 * So these two read the figures tolerantly and show a missing one as zero. Everywhere a number is
 * being decided rather than reported — pricing, tenders, discounts — keeps the strict formatter.
 */

/** @param {unknown} value @returns {number} minor units, or 0 if that is not what it is */
export const minorOrZero = (value) => (Number.isSafeInteger(value) ? value : 0);

/**
 * Formats one of a committed sale's own figures.
 * @param {{ money: (minor: number) => string }} fmt
 * @param {unknown} value
 */
export const soldMoney = (fmt, value) => fmt.money(minorOrZero(value));
