export default {
	// ## Server settings

	// ### `public`
	//
	// When set to `true`, The Lounge starts in public mode. When set to `false`,
	// it starts in private mode.
	//
	// - A **public server** does not require authentication. Anyone can connect
	//   to IRC networks in this mode. All IRC connections and channel
	//   scrollbacks are lost when a user leaves the client.
	// - A **private server** requires users to log in. Their IRC connections are
	//   kept even when they are not using or logged in to the client. All joined
	//   channels and scrollbacks are available when they come back.
	//
	// This value is set to `false` by default.
	public: false,

	// ### `host`
	//
	// IP address or hostname for the web server to listen to. For example, set it
	// to `"127.0.0.1"` to accept connections from localhost only.
	//
	// For UNIX domain sockets, use `"unix:/absolute/path/to/file.sock"`.
	//
	// This value is set to `undefined` by default to listen on all interfaces.
	host: "0.0.0.0",

	// ### `port`
	//
	// Set the port to listen to.
	//
	// This value is set to `9000` by default.
	port: 9000,

	// ### `bind`
	//
	// Set the local IP to bind to for outgoing connections.
	//
	// This value is set to `undefined` by default to let the operating system
	// pick its preferred one.
	bind: undefined,

	// ### `reverseProxy`
	//
	// When set to `true`, The Lounge is marked as served behind a reverse proxy
	// and will honor the `X-Forwarded-For` header.
	//
	// This value is set to `false` by default.
	reverseProxy: false,

	// ### `maxHistory`
	//
	// Defines the maximum number of history lines that will be kept in memory per
	// channel/query, in order to reduce the memory usage of the server. Setting
	// this to `-1` will keep unlimited amount.
	//
	// This value is set to `10000` by default.
	maxHistory: 10000,

	// ### `https`
	//
	// These settings are used to run The Lounge's web server using encrypted TLS.
	//
	// If you want more control over the webserver,
	// [use a reverse proxy instead](https://thelounge.chat/docs/guides/reverse-proxies).
	//
	// The available keys for the `https` object are:
	//
	// - `enable`: when set to `false`, HTTPS support is disabled
	//    and all other values are ignored.
	// - `key`: Path to the private key file.
	// - `certificate`: Path to the certificate.
	// - `ca`: Path to the CA bundle.
	//
	// The value of `enable` is set to `false` to disable HTTPS by default, in
	// which case the other two string settings are ignored.
	https: {
		enable: false,
		key: "",
		certificate: "",
		ca: "",
	},

	// ## Client settings

	// ### `theme`
	//
	// Set the default theme to serve to new users. They will be able to select a
	// different one in their client settings among those available.
	//
	// The Lounge ships with two themes (`default` and `morning`) and can be
	// extended by installing more themes. Read more about how to manage them
	// [here](https://thelounge.chat/docs/guides/theme-creation).
	//
	// This value needs to be the package name and not the display name. For
	// example, the value for Morning would be `morning`, and the value for
	// Solarized would be `thelounge-theme-solarized`.
	//
	// This value is set to `"default"` by default.
	theme: "default",

	// ### `prefetch`
	//
	// When set to `true`, The Lounge will load thumbnails and site descriptions
	// from URLs posted in channels and private messages.
	//
	// This value is set to `false` by default.
	prefetch: false,

	// ### `disableMediaPreview`
	//
	// When set to `true`, The Lounge will not preview media (images, video and
	// audio) hosted on third-party sites. This ensures the client does not
	// make any requests to external sites. If `prefetchStorage` is enabled,
	// images proxied via the The Lounge will be previewed.
	//
	// This has no effect if `prefetch` is set to `false`.
	//
	// This value is set to `false` by default.
	disableMediaPreview: false,

	// ### `prefetchStorage`

	// When set to `true`, The Lounge will store and proxy prefetched images and
	// thumbnails on the filesystem rather than directly display the content at
	// the original URLs.
	//
	// This option primarily exists to resolve mixed content warnings by not
	// loading images from http hosts. This option does not work for video
	// or audio as The Lounge will only load these from https hosts.
	//
	// If storage is enabled, The Lounge will fetch and store images and thumbnails
	// in the `${THELOUNGE_HOME}/storage` folder.
	//
	// Images are deleted when they are no longer referenced by any message
	// (controlled by `maxHistory`), and the folder is cleaned up when The Lounge
	// restarts.
	//
	// This value is set to `false` by default.
	prefetchStorage: false,

	// ### `prefetchMaxImageSize`
	//
	// When `prefetch` is enabled, images will only be displayed if their file
	// size does not exceed this limit.
	//
	// This value is set to `2048` kilobytes by default.
	prefetchMaxImageSize: 2048,

	// ### prefetchMaxSearchSize
	//
	// This value sets the maximum response size allowed when finding the Open
	// Graph tags for link previews. The entire response is temporarily stored
	// in memory and for some sites like YouTube this can easily exceed 300
	// kilobytes.
	//
	// This value is set to `50` kilobytes by default.
	prefetchMaxSearchSize: 50,

	// ### `prefetchTimeout`
	//
	// When `prefetch` is enabled, this value sets the number of milliseconds
	// before The Lounge gives up attempting to fetch a link. This can be useful
	// if you've increased the `prefetchMaxImageSize`.
	//
	// Take caution, however, that an inordinately large value may lead to
	// performance issues or even a denial of service, since The Lounge will not
	// be able to clean up outgoing connections as quickly. Usually the default
	// value is appropriate, so only change it if necessary.
	//
	// This value is set to `5000` milliseconds by default.
	prefetchTimeout: 5000,

	// ### `fileUpload`
	//
	// Allow uploading files to the server hosting The Lounge.
	//
	// Files are stored in the `${THELOUNGE_HOME}/uploads` folder, do not expire,
	// and are not removed by The Lounge. This may cause issues depending on your
	// hardware, for example in terms of disk usage.
	//
	// The available keys for the `fileUpload` object are:
	//
	// - `enable`: When set to `true`, files can be uploaded on the client with a
	//   drag-and-drop or using the upload dialog.
	// - `maxFileSize`: When file upload is enabled, users sending files above
	//   this limit will be prompted with an error message in their browser. A value of
	//   `-1` disables the file size limit and allows files of any size. **Use at
	//   your own risk.** This value is set to `10240` kilobytes by default.
	// - `baseUrl`: If you want to change the URL where uploaded files are accessed,
	//   you can set this option to `"https://example.com/folder/"` and the final URL
	//   would look like `"https://example.com/folder/aabbccddeeff1234/name.png"`.
	//   If you use this option, you must have a reverse proxy configured,
	//   to correctly proxy the uploads URLs back to The Lounge.
	//   This value is set to `null` by default.
	fileUpload: {
		enable: false,
		maxFileSize: 10240,
		baseUrl: null,
	},

	// ### `allowFileUploadBackendSelection`
	//
	// Allow changing the backend for uploaded file hosting.
	//
	// This value is set to `true` by default.
	allowFileUploadBackendSelection: true,

	// ### `maskFileHost`
	//
	// Allow masking the file host with the `fileUpload.baseUrl`
	//
	// When set to `true` the host for uploaded files (non local) will be replaced with the
	// `fileUpload.baseUrl` This only useful if you are proxying externally hosted files
	// with a custom URL. You should leave this as `false` unless you know what you are doing.
	//
	// Example:
	//   With `fileUpload.baseUrl` set to `my.custom.url` and using `example.com` file host
	//   `https://img.example.com/QZNFCc.png` becomes `https://my.custom.url/QZNFCc.png`
	//
	// This value is set to `false` by default.
	maskFileHost: false,

	// ### `transports`
	//
	// Set `socket.io` transports.
	//
	// This value is set to `["polling", "websocket"]` by default.
	transports: ["polling", "websocket"],

	// ### `leaveMessage`
	//
	// Set users' default `quit` and `part` messages if they are not providing
	// one.
	//
	// This value is set to `"The Lounge - https://thelounge.chat"` by
	// default.
	leaveMessage: "The Lounge - https://thelounge.chat",

	// ## Default network

	// ### `defaults`
	//
	// Specifies default network information that will be used as placeholder
	// values in the *Connect* window.
	//
	// The available keys for the `defaults` object are:
	//
	// - `name`: Name to display in the channel list of The Lounge. This value is
	//   not forwarded to the IRC network.
	// - `host`: IP address or hostname of the IRC server.
	// - `port`: Usually 6667 for unencrypted connections and 6697 for
	//   connections encrypted with TLS.
	// - `password`: Connection password. If the server supports SASL capability,
	//   then this password will be used in SASL authentication.
	// - `tls`: Enable TLS connections
	// - `rejectUnauthorized`: Whether the server certificate should be verified
	//   against the list of supplied Certificate Authorities (CAs) by your
	//   Node.js installation.
	// - `nick`: Nick name. Percent signs (`%`) will be replaced by random
	//   numbers from 0 to 9. For example, `Guest%%%` may become `Guest123`.
	// - `username`: User name.
	// - `realname`: Real name displayed by some clients. Defaults to the nick if set to ""
	// - `leaveMessage`: Network specific leave message (overrides global leaveMessage)
	// - `join`: Comma-separated list of channels to auto-join once connected.
	//
	// This value is set to connect to the official channel of The Lounge on
	// Libera.Chat by default:
	//
	// ```js
	// defaults: {
	//   name: "Libera.Chat",
	//   host: "irc.libera.chat",
	//   port: 6697,
	//   password: "",
	//   tls: true,
	//   rejectUnauthorized: true,
	//   nick: "thelounge%%",
	//   username: "thelounge",
	//   realname: "The Lounge User",
	//   join: "#thelounge"
	// }
	// ```
	defaults: {
		name: "Libera.Chat",
		host: "irc.libera.chat",
		port: 6697,
		password: "",
		tls: true,
		rejectUnauthorized: true,
		nick: "thelounge%%",
		username: "thelounge",
		realname: "",
		join: "#thelounge",
		leaveMessage: "",
	},

	// ### `lockNetwork`
	//
	// When set to `true`, users will not be able to modify host, port and TLS
	// settings and will be limited to the configured network.
	// These fields will also be hidden from the UI.
	//
	// This value is set to `false` by default.
	lockNetwork: false,

	// ## User management

	// ### `messageStorage`

	// The Lounge can log user messages, for example to access them later or to
	// reload messages on server restart.

	// Set this array with one or multiple values to enable logging:
	// - `text`: Messages per network and channel will be stored as text files.
	//   **Messages will not be reloaded on restart.**
	// - `sqlite`: Messages are stored in SQLite database files, one per user.
	//
	// Logging can be disabled globally by setting this value to an empty array
	// `[]`. Logging is also controlled per user individually in the `log` key of
	// their JSON configuration file.
	//
	// This value is set to `["sqlite", "text"]` by default.
	messageStorage: ["sqlite", "text"],

	// ### `storagePolicy`

	// When the sqlite storage is in use, control the maximum storage duration.
	// A background task will periodically clean up messages older than the limit.

	// The available keys for the `storagePolicy` object are:
	//
	// - `enabled`: If this is false, the cleaning task is not running.
	// - `maxAgeDays`: Maximum age of an entry in days.
	// - `deletionPolicy`: Controls what types of messages are being deleted.
	//   Valid options are:
	//   - `statusOnly`: Only delete message types which are status related (e.g. away, back, join, parts, mode, ctcp...)
	//     but keep actual messages from nicks. This keeps the DB size down while retaining "precious" messages.
	//   - `everything`: Delete everything, including messages from irc nicks
	storagePolicy: {
		enabled: false,
		maxAgeDays: 7,
		deletionPolicy: "statusOnly",
	},

	// ### `massEventDetection`
	//
	// Configure detection and aggregation of mass IRC events (netsplits/reconnects).
	// When enabled, rapid consecutive status messages are buffered and displayed as
	// a single summary message instead of flooding the chat with individual messages.
	//
	// The available keys for the `massEventDetection` object are:
	//
	// - `enable`: When set to `true`, mass event detection is active.
	// - `threshold`: Number of status messages within the window that triggers
	//   mass event mode.
	// - `windowMs`: Time window in milliseconds for counting messages toward threshold.
	// - `cooldownMs`: Time in milliseconds of inactivity before ending a mass event.
	// - `maxDurationMs`: Maximum duration of a mass event in milliseconds (safety limit).
	// - `refreshNamesAfter`: Whether to send NAMES after mass event ends to refresh
	//   the user list.
	//
	// This value is set to enable mass event detection by default:
	massEventDetection: {
		enable: true,
		threshold: 10,        // Trigger after 10 messages (was 20)
		windowMs: 10000,      // 10 second window (was 5s)
		cooldownMs: 10000,    // 10 seconds of inactivity to end (was 3s)
		maxDurationMs: 300000, // 5 minute max (was 1 min)
		refreshNamesAfter: true,
	},

	// ### `useHexIp`
	//
	// When set to `true`, users' IP addresses will be encoded as hex.
	//
	// This is done to share the real user IP address with the server for host
	// masking purposes. This is encoded in the `username` field and only supports
	// IPv4.
	//
	// This value is set to `false` by default.
	useHexIp: false,

	// ## WEBIRC support
	//
	// When enabled, The Lounge will pass the connecting user's host and IP to the
	// IRC server. Note that this requires to obtain a password from the IRC
	// network that The Lounge will be connecting to and generally involves a lot
	// of trust from the network you are connecting to.
	//
	// There are 2 ways to configure the `webirc` setting:
	//
	// - **Basic**: an object where keys are IRC hosts and values are passwords.
	//   For example:
	//
	//   ```json
	//   webirc: {
	//     "irc.example.net": "thisiswebircpassword1",
	//     "irc.example.org": "thisiswebircpassword2",
	//   },
	//   ```
	//
	// - **Advanced**: an object where keys are IRC hosts and values are functions
	//   that take two arguments (`webircObj`, `network`) and return an
	//   object to be directly passed to `irc-framework`. `webircObj` contains the
	//   generated object which you can modify. For example:
	//
	//   ```js
	//   webirc: {
	//     "irc.example.com": (webircObj, network) => {
	//       webircObj.password = "thisiswebircpassword";
	//       webircObj.hostname = `webirc/${webircObj.hostname}`;
	//       return webircObj;
	//     },
	//   },
	//   ```
	//
	// This value is set to `null` to disable WEBIRC by default.
	webirc: null,

	// ## Torrent sites default configuration
	//

	defaultTorrentSiteInfo: {
		groupsUrl: '/stats/groups',
		placeholderAvatar: 'data:image/gif;base64,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',
		placeholderAvatarUrl: `/img/profile.png`,
		profileUrl: `/users/`,
		avatarUrl: `/authenticated-images/user-avatars/`,
		iconUrl: `/authenticated-images/user-icons/`,
	},

	// ## Torrent sites support
	//
	// Configure torrent sites for specific IRC networks.
	// Keys are IRC hostnames, values are URL templates where {host} and {channel} will be replaced.
	// For example:
	// torrentSites: [
	//   {
	//      abbreviation: 'TNB',
	// 		name: 'ThatNeoByte',
	// 		host: 'irc.tnb.moe',
	// 		domain: 'darkpeers.org',
	// 	},
	// ]
	// This value is set to null to disable by default.
	// TODO: see if this will be enabled by default for some popular torrent sites
	torrentSites: [
		{
			abbreviation: 'TNB',
			name: 'ThatNeoByte',
			host: 'irc.tnb.moe',
			domain: 'darkpeers.org',
		},
		{
			abbreviation: 'ULCX',
			name: 'Upload.cx',
			host: 'irc.upload.cx',
			domain: 'upload.cx',
			channels: ["#Announce", "#ULCX", "#Support"]
		},
		{
			abbreviation: 'RFX',
			name: 'Reelflix',
			host: 'irc.reelflix.cc',
			domain: 'reelflix.cc',
		},
		{
			abbreviation: 'SP',
			name: 'Seedpool',
			host: 'irc.seedpool.org',
			domain: 'seedpool.org',
		},
		{
			abbreviation: 'HHD',
			name: 'HomieHelpdesk',
			host: 'irc.homiehelpdesk.net',
			domain: 'homiehelpdesk.net',
		},
		{
			abbreviation: 'DP',
			name: 'DarkPeers',
			host: 'irc.p2p-network.net',
			domain: 'darkpeers.org',
			channels: ['#darkpeers', '#dphelp', '#dplog', '#dpmoderation', '#dpstaff'],
		},
		{
			abbreviation: 'BLU',
			name: 'Blutopia',
			host: 'irc.p2p-network.net',
			domain: 'blutopia.cc',
			channels: ['#blutopia'],
		},
		{
			abbreviation: 'RAS',
			name: 'Rastastugan',
			host: 'irc.rizon.net',
			domain: 'rastastugan.org',
			channels: ['#rastastugan'],
		},
		{
			abbreviation: 'LST',
			name: 'LST',
			host: 'irc.lst.gg',
			domain: 'lst.gg',
		},
		{
			abbreviation: 'LUME',
			name: 'Luminarr',
			host: 'irc.luminarr.me',
			domain: 'luminarr.me',
		},
		{
			abbreviation: 'STC',
			name: 'Skip The Commercials',
			host: 'irc.skipthecommercials.xyz',
			domain: 'skipthecommercials.xyz',
		},
		{
			abbreviation: 'RHD',
			name: 'Rocket HD',
			host: 'irc.rocket-hd.cc',
			domain: 'rocket-hd.cc',
		},
		{
			abbreviation: 'A4K',
			name: 'Aura4K',
			host: 'irc.aura4k.net',
			domain: 'aura4k.net',
		},
		{
			disabled: true, // Disable OE+ support, as they require the file extension in the avatar URL
			abbreviation: 'OE+',
			name: 'OnlyEncodes+',
			host: 'irc.onlyencodes.cc',
			domain: 'onlyencodes.cc',
		},
		{
			disabled: true, // Disable ANT support, as it does not use the username in the avatar URL
			abbreviation: 'ANT',
			name: 'Anthelion',
			host: 'irc.nebulance.io',
			domain: 'anthelion.me',
			channels: ['#ant', '#ant-announce', '#ant-help', '#ant-disabled', '#ant-invites', '#ant-shout',]
		}
	],

	// ## identd and oidentd support

	// ### `identd`
	//
	// Run The Lounge with `identd` support.
	//
	// The available keys for the `identd` object are:
	//
	// - `enable`: When `true`, the identd daemon runs on server start.
	// - `port`: Port to listen for ident requests.
	//
	// The value of `enable` is set to `false` to disable `identd` support by
	// default, in which case the value of `port` is ignored. The default value of
	// `port` is 113.
	identd: {
		enable: false,
		port: 113,
	},

	// ### `oidentd`
	//
	// When this setting is a string, this enables `oidentd` support using the
	// configuration file located at the given path.
	//
	// This is set to `null` by default to disable `oidentd` support.
	oidentd: null,

	// ## LDAP support

	// These settings enable and configure LDAP authentication.
	//
	// They are only being used in private mode. To know more about private mode,
	// see the `public` setting above.

	//
	// The authentication process works as follows:
	//
	// 1. The Lounge connects to the LDAP server with its system credentials.
	// 2. It performs an LDAP search query to find the full DN associated to the
	//    user requesting to log in.
	// 3. The Lounge tries to connect a second time, but this time using the
	//    user's DN and password. Authentication is validated if and only if this
	//    connection is successful.
	//
	// The search query takes a couple of parameters in `searchDN`:
	//
	// - a base DN `searchDN/base`. Only children nodes of this DN will likely
	//   be returned;
	// - a search scope `searchDN/scope` (see LDAP documentation);
	// - the query itself, built as `(&(<primaryKey>=<username>) <filter>)`
	//   where `<username>` is the user name provided in the log in request,
	//   `<primaryKey>` is provided by the config and `<filter>` is a filtering
	//   complement also given in the config, to filter for instance only for
	//   nodes of type `inetOrgPerson`, or whatever LDAP search allows.
	//
	// Alternatively, you can specify the `bindDN` parameter. This will make The
	// Lounge ignore `searchDN` options and assume that the user DN is always
	// `<bindDN>,<primaryKey>=<username>`, where `<username>` is the user name
	// provided in the log in request, and `<bindDN>` and `<primaryKey>` are
	// provided by the configuration.
	//
	// The available keys for the `ldap` object are:
	ldap: {
		// - `enable`: when set to `false`, LDAP support is disabled and all other
		//   values are ignored.
		enable: false,

		// - `url`: A url of the form `ldaps://<ip>:<port>`.
		//   For plain connections, use the `ldap` scheme.
		url: "ldaps://example.com",

		// - `tlsOptions`: LDAP connection TLS options (only used if scheme is
		//   `ldaps://`). It is an object whose values are Node.js' `tls.connect()`
		//   options. It is set to `{}` by default.
		//   For example, this option can be used in order to force the use of IPv6:
		//   ```js
		//   {
		//     host: 'my::ip::v6',
		//     servername: 'example.com'
		//   }
		//   ```
		tlsOptions: {},

		// - `primaryKey`: LDAP primary key. It is set to `"uid"` by default.
		primaryKey: "uid",

		// - `baseDN`: LDAP base DN, alternative to `searchDN`. For example, set it
		//   to `"ou=accounts,dc=example,dc=com"`.
		//   When unset, the LDAP auth logic with use `searchDN` instead to locate users.

		// - `searchDN`: LDAP search DN settings. This defines the procedure by
		//   which The Lounge first looks for the user DN before authenticating them.
		//   It is ignored if `baseDN` is specified. It is an object with the
		//   following keys:
		searchDN: {
			//   - `rootDN`: This bind DN is used to query the server for the DN of
			//     the user. This is supposed to be a system user that has access in
			//     read-only to the DNs of the people that are allowed to log in.
			//     It is set to `"cn=thelounge,ou=system-users,dc=example,dc=com"` by
			//     default.
			rootDN: "cn=thelounge,ou=system-users,dc=example,dc=com",

			//   - `rootPassword`: Password of The Lounge LDAP system user.
			rootPassword: "1234",

			//   - `filter`: it is set to `"(&(objectClass=person)(memberOf=ou=accounts,dc=example,dc=com))"`
			//     by default.
			filter: "(&(objectClass=person)(memberOf=ou=accounts,dc=example,dc=com))",

			//   - `base`: LDAP search base (search only within this node). It is set
			//     to `"dc=example,dc=com"` by default.
			base: "dc=example,dc=com",

			//   - `scope`: LDAP search scope. It is set to `"sub"` by default.
			scope: "sub",
		},
	},

	// ## Debugging settings

	// The `debug` object contains several settings to enable debugging in The
	// Lounge. Use them to learn more about an issue you are noticing but be aware
	// this may produce more logging or may affect connection performance so it is
	// not recommended to use them by default.
	//
	// All values in the `debug` object are set to `false`.
	debug: {
		// ### `debug.logs`
		//
		// When set to true, this enables extra debugging output
		logs: false,
		// ### `debug.ircFramework`
		//
		// When set to true, this enables extra debugging output provided by
		// [`irc-framework`](https://github.com/kiwiirc/irc-framework), the
		// underlying IRC library for Node.js used by The Lounge.
		ircFramework: false,

		// ### `debug.raw`
		//
		// When set to `true`, this enables logging of raw IRC messages into each
		// server window, displayed on the client.
		raw: false,
	},
};
