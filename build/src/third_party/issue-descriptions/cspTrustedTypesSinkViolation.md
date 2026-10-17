# Trusted Type expected, but got String

Your site tries to use a plain string in a DOM change where a Trusted Type is expected. Requiring Trusted Types for DOM changes helps to stop cross-site scripting attacks.

To solve this, provide a Trusted Type to all the DOM changes listed below. You can convert a string into a Trusted Type by:

* defining a policy and using its corresponding `createHTML`, `createScript` or `createScriptURL` function.
* defining a policy named `default` which will be automatically called.
