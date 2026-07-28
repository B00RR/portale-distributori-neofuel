/* global module */

/**
 * CommonJS adapter for Lighthouse CI puppeteerScript (#342).
 *
 * @lhci/cli requires module.exports to be directly a function:
 * module.exports = async (browser, context) => ...
 */
module.exports = async function lighthouseAuthCjs(browser, context) {
  const mod = await import('./lighthouse-auth.js');
  return mod.default(browser, context);
};
