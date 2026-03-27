interface UploadProvider {
	id: string,
	displayName: string,
	requiresToken: boolean;
	validTtl?: UploadTTL[];
	supportNote?:string;
	upload: (file: File, ttl: string, token?: string) => Promise<string>;
};

interface UploadTTL {
	id: string;
	displayName: string;
	value: string;
	default?: boolean;
};

export const UploadProviders: UploadProvider[] = [
	{
		id: "new",
		displayName: "TheLounge (Local)",
		requiresToken: false,
		upload () { return Promise.resolve("dummy") },
	},
	{
		id: "imagebb",
		displayName: "ImageBB",
		requiresToken: true,
		validTtl: [
			{
				id: "1week",
				displayName: "1 Week",
				value: "604800",
			},
			{
				id: "3days",
				displayName: "3 Days",
				value: "259200",
				default: true,
			},
			{
				id: "1day",
				displayName: "1 Day",
				value: "86400",
			},
			{
				id: "forever",
				displayName: "Keep Forever",
				value: "-",
			}
		],
		supportNote: "Supported files: Images",
		async upload(file: File, ttl: string, token?: string) {
			const uploadTTL = this.validTtl?.find(t => t.id === ttl);

			const payload = new FormData();
			payload.append("key", token!);
			payload.append("image", file);

			if (uploadTTL && uploadTTL.id !== "forever") {
				payload.append("expiration", uploadTTL.value);
			}

			const response = await fetch("https://api.imgbb.com/1/upload", {
				method: "POST",
				body: payload,
			});

			const json = await response.json();

			if (!response.ok) {
				throw new Error(json.error?.message ?? "Unknown Error");
			}

			const url = <string>json.data?.url ?? "";

			if (!url.startsWith("http")) {
				throw new Error(url ?? "Unknown Error");
			}

			return url;
		},
	},
	{
		id: "catbox",
		displayName: "Catbox",
		requiresToken: false,
		validTtl: [
			{
				id: "3days",
				displayName: "3 Days",
				value: "72h",
				default: true,
			},
			{
				id: "1day",
				displayName: "1 Day",
				value: "24h",
			},
			{
				id: "forever",
				displayName: "Keep Forever",
				value: "-",
			}
		],
		supportNote: "Supported files: Images, Videos, Audio, and Text",
		async upload(file: File, ttl: string) {
			const uploadTTL = this.validTtl?.find(t => t.id === ttl);

			const payload = new FormData();
			payload.append("reqtype", "fileupload");
			payload.append("fileToUpload", file);

			let uploadUrl = "https://catbox.moe/user/api.php";

			if (uploadTTL && uploadTTL.id !== "forever") {
				payload.append("time", uploadTTL.value);
				uploadUrl = "https://litterbox.catbox.moe/resources/internals/api.php";
			}

			const response = await fetch(uploadUrl, {
				method: "POST",
				body: payload,
			});

			const url = await response.text();

			if (!response.ok || !url.startsWith("http")) {
				throw new Error(url ?? "Unknown Error");
			}

			return url;
		},
	},
	{
		id: "ptscreens",
		displayName: "PTScreens",
		requiresToken: true,
		validTtl: [
			{
				id: "1week",
				displayName: "1 Week",
				value: "P7D",
			},
			{
				id: "3days",
				displayName: "3 Days",
				value: "P3D",
				default: true,
			},
			{
				id: "1day",
				displayName: "1 Day",
				value: "P1D",
			},
			{
				id: "forever",
				displayName: "Keep Forever",
				value: "-",
			}
		],
		supportNote: "Supported files: Images",
		async upload(file: File, ttl: string, token?: string) {
			const uploadTTL = this.validTtl?.find(t => t.id === ttl);

			const payload = new FormData();
			payload.append("format", "txt");
			payload.append("key", token!);
			payload.append("source", file);

			if (uploadTTL && uploadTTL.id !== "forever") {
				payload.append("expiration", uploadTTL.value);
			}

			const response = await fetch("https://ptscreens.com/api/1/upload", {
				method: "POST",
				body: payload,
			});

			const url = await response.text();

			if (!response.ok || !url.startsWith("http")) {
				throw new Error(url ?? "Unknown Error");
			}

			return url;
		},
	},
	{
		id: "quax",
		displayName: "qu.ax",
		requiresToken: false,
		validTtl: [
			{
				id: "1week",
				displayName: "1 Week",
				value: "7",
			},
			{
				id: "3days",
				displayName: "3 Days",
				value: "3",
				default: true,
			},
			{
				id: "1day",
				displayName: "1 Day",
				value: "1",
			},
			{
				id: "forever",
				displayName: "Keep Forever",
				value: "-1",
			}
		],
		supportNote: "Supported files: Images, Video, and Text",
		async upload(file: File, ttl: string) {
			const uploadTTL = this.validTtl?.find(t => t.id === ttl);

			const payload = new FormData();
			payload.append("files[]", file);
			payload.append("expiry", uploadTTL?.value ?? "-1");

			const response = await fetch("https://qu.ax/upload", {
				method: "POST",
				body: payload,
			});

			const url = await response.text();

			if (!response.ok || !url.startsWith("http")) {
				throw new Error(url ?? "Unknown Error");
			}

			const json = await response.json();

			if (!response.ok || json?.success !== true) {
				throw new Error(json?.description ?? "Unknown Error");
			}

			// json?.files?.[0]?.url is not the url to the raw image
			const fName = <string>json?.files?.[0]?.file_name

			// eslint-disable-next-line eqeqeq
			if (fName == null) {
				throw new Error("Unknown Error");
			}

			return `https://qu.ax/x/${fName}.${file.name.split(".").pop()}`;
		},
	},
	{
		id: "uguu",
		displayName: "Uguu",
		requiresToken: false,
		validTtl: [
			{
				id: "3hours",
				displayName: "3 Hours",
				value: "3",
				default: true,
			},
		],
		supportNote: "Supported files: Images, Video, Audio, and Text",
		async upload(file: File) {
			const payload = new FormData();
			payload.append("files[]", file);

			const response = await fetch("https://uguu.se/upload", {
				method: "POST",
				body: payload,
			});

			const json = await response.json();

			if (!response.ok || json?.success !== true) {
				throw new Error(json?.description ?? "Unknown Error");
			}

			const url = <string>json?.files?.[0]?.url ?? "";

			if (!url.startsWith("http")) {
				throw new Error(url || "Unknown Error");
			}

			return url;
		},
	},
	{
		id: "onlyimage",
		displayName: "OnlyImage",
		requiresToken: true,
		validTtl: [
			{
				id: "1week",
				displayName: "1 Week",
				value: "P7D",
			},
			{
				id: "3days",
				displayName: "3 Days",
				value: "P3D",
				default: true,
			},
			{
				id: "1day",
				displayName: "1 Day",
				value: "P1D",
			},
			{
				id: "forever",
				displayName: "Keep Forever",
				value: "-",
			}
		],
		supportNote: "Supported files: Images",
		async upload(file: File, ttl: string, token?: string) {
			const uploadTTL = this.validTtl?.find(t => t.id === ttl);

			const payload = new FormData();
			payload.append("format", "txt");
			payload.append("key", token!);
			payload.append("source", file);

			if (uploadTTL && uploadTTL.id !== "forever") {
				payload.append("expiration", uploadTTL.value);
			}

			const response = await fetch("https://onlyimage.org/api/1/upload", {
				method: "POST",
				body: payload,
			});

			const url = await response.text();

			if (!response.ok || !url.startsWith("http")) {
				throw new Error(url ?? "Unknown Error");
			}

			return url;
		},
	},
	{
		id: "ptpimg",
		displayName: "ptpimg",
		requiresToken: true,
		validTtl: [
			{
				id: "forever",
				displayName: "Keep Forever",
				value: "-",
				default: true,
			}
		],
		supportNote: "Supported files: Images",
		async upload(file: File, ttl: string, token?: string) {
			const payload = new FormData();
			payload.append("format", "json");
			payload.append("api_key", token!);
			payload.append("file-upload[0]", file);

			const response = await fetch("https://ptpimg.me/upload.php", {
				method: "POST",
				headers: {
					referer: "https://ptpimg.me/index.php",
				},
				body: payload,
			});

			const json = await response.json();

			if (!response.ok || !json?.[0]?.code || !json?.[0]?.ext) {
				throw new Error(json?.error?.message ?? "Unknown Error");
			}

			return `https://ptpimg.me/${json[0].code}.${json[0].ext}`;
		},
	}
];
