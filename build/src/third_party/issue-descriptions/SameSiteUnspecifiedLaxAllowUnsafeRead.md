# Indicate whether to send a cookie in a cross-site request by specifying its SameSite attribute

Because a cookie’s `SameSite` attribute wasn’t set or is invalid, it defaults to `SameSite=Lax`,
which will stop the cookie from being sent in a cross-site request in a future version of the browser.
This behavior protects user data from accidentally leaking to third parties and cross-site request forgery.

Resolve this issue by updating the attributes of the cookie:
* Specify `SameSite=None` and `Secure` if the cookie should be sent in cross-site requests. This enables third-party use.
* Specify `SameSite=Strict` or `SameSite=Lax` if the cookie shouldn’t be sent in cross-site requests.
