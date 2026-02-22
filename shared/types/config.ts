export type ConfigTheme = {
	displayName: string;
	name: string;
	themeColor: string | null;
};
type SharedConfigurationBase = {
	public: boolean;
	useHexIp: boolean;
	prefetch: boolean;
	fileUpload: boolean;
	ldapEnabled: boolean;
	fishEnabled: boolean;
	ftpInviteEnabled: boolean;
	encodingEnabled: boolean;
	isUpdateAvailable: boolean;
	applicationServerKey: string;
	version: string;
	gitCommit: string | null;
	themes: ConfigTheme[];
	defaultTheme: string;
	fileUploadMaxFileSize?: number;
	fileUploadType?: "local" | "x0";
	fileUploadX0Host?: string;
};

export type ConfigNetDefaults = {
	name: string;
	host: string;
	port: number;
	password: string;
	tls: boolean;
	rejectUnauthorized: boolean;
	nick: string;
	username: string;
	realname: string;
	join: string;
	leaveMessage: string;
	sasl: string;
	saslAccount: string;
	saslPassword: string;
};
export type LockedConfigNetDefaults = Omit<
	ConfigNetDefaults,
	"host" | "name" | "port" | "tls" | "rejectUnauthorized"
>;

export type LockedSharedConfiguration = SharedConfigurationBase & {
	lockNetwork: true;
	defaults: LockedConfigNetDefaults;
};

export type SharedConfiguration = SharedConfigurationBase & {
	lockNetwork: false;
	defaults: ConfigNetDefaults;
};
