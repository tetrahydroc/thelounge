import {Client as FtpClient, AccessOptions} from "basic-ftp";
import Network from "../models/network.js";

export interface FtpInviteConfig {
	enabled: boolean;
	host: string;
	port: number;
	username: string;
	password: string;
	tls: boolean; // FTP over explicit TLS (FTPS)
}

export class FtpInviteClient {
	private client: FtpClient;

	constructor() {
		this.client = new FtpClient(10000); // 10 second timeout
	}

	async sendInvite(
		config: FtpInviteConfig,
		targetUsername: string
	): Promise<{success: boolean; message: string}> {
		if (!config.enabled) {
			return {success: false, message: "FTP invites are not enabled for this network"};
		}

		if (!config.host || !config.username) {
			return {success: false, message: "FTP configuration incomplete"};
		}

		try {
			const accessOptions: AccessOptions = {
				host: config.host,
				port: config.port,
				user: config.username,
				password: config.password,
				secure: config.tls, // Enable FTP over explicit TLS
				secureOptions: {
					rejectUnauthorized: false, // Accept self-signed certificates
				},
			};

			await this.client.access(accessOptions);

			// Send SITE INVITE command
			await this.client.send(`SITE INVITE ${targetUsername}`);

			this.client.close();

			return {success: true, message: `FTP invite sent for ${targetUsername}`};
		} catch (error) {
			this.client.close();

			return {
				success: false,
				message: `FTP invite failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	close(): void {
		this.client.close();
	}
}

export async function sendFtpInvite(
	network: Network,
	targetUsername: string,
	passwordOverride?: string
): Promise<{success: boolean; message: string}> {
	const config: FtpInviteConfig = {
		enabled: network.ftpEnabled || false,
		host: network.ftpHost || "",
		port: network.ftpPort || 21,
		username: network.ftpUsername || "",
		password: passwordOverride ?? network.ftpPassword ?? "",
		tls: network.ftpTls || false,
	};

	const ftpClient = new FtpInviteClient();

	return await ftpClient.sendInvite(config, targetUsername);
}
