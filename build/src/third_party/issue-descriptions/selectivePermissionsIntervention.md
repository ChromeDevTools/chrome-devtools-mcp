# Selective permissions intervention

The Selective Permissions Intervention blocks calls to privacy-sensitive APIs when they are called from ad scripts to align the permission grant with the user’s intent. The particular API that was blocked, the call-stack that triggered the intervention, and why the script that called the API is considered ad-related is shown below.

Note that Chrome considers any script with a URL that matches a rule in the [filterlist](ChromeFilterlistRepository) as ad script, and the matching rule is shown in the Ad Ancestry section. In addition, any script loaded while an ad script is in the JavaScript stack will also be considered an ad script by Chrome and is also shown in Ad Ancestry.

If you believe this intervention was in error (e.g., this call would occur even when loading the page with an ad blocker enabled), then [file a bug](SelectivePermissionsInterventionIssue).
