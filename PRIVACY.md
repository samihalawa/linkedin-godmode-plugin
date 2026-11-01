# LinkedIn Godmode privacy information

This is an independent local browser and HTTP integration maintained by Sami Halawa. The package is not operated by LinkedIn. Requested browser or HTTP actions send data to the sites you navigate to or explicitly address. Browserbase or Anchor Browser receives session and task data when you choose and configure that hosted provider.

Plugin startup may download and cache the pinned `linkedin-godmode@0.1.3` package and dependencies from npm; this bootstrap does not upload your shared Chrome profile or authentication data to npm.

Local settings are read from the configured file or environment. Local browser profiles and runtime session state are stored in the configured state and profile directories; the defaults are beneath `.local/state/linkedin-godmode`. Browser profiles may retain authenticated sessions and site data. Captured network records can contain requested headers, page content and response bodies, subject to the implemented redaction and capture limits. Tool results and captures are returned to the invoking client or assistant. Redaction does not make every page or response nonpersonal.

This package does not include a publisher-operated collection backend. It does not automatically delete your existing browser profiles, site data or provider-side records when uninstalled. Manage those through the configured profile location, browser, upstream site and chosen hosted provider. Retention by the assistant host or hosted provider follows that service's settings and policies; this package does not set their retention periods.

For package questions, use this repository's support link. Keep session credentials, private page content and unredacted captures out of public issues.
