import { getSftpCapability } from "./pluginContext";

const cordovaExec = cordova.require("cordova/exec");

function invoke(action, args, onSuccess, onFail) {
	getSftpCapability()
		.then((capability) => {
			cordovaExec(onSuccess, onFail, "Sftp", action, [capability, ...args]);
		})
		.catch((error) => {
			onFail?.(error?.message || String(error));
		});
}

// This bridge is imported only by Acode's bundled application modules. The
// SFTP Cordova plugin deliberately does not clobber window.sftp. This alone
// does not isolate same-realm code: the SSH-safe edition must block third-party
// scripts before execution (see sshSecurityPolicy and the plugin loader).
const nativeSftp = {
	exec(command, onSuccess, onFail) {
		invoke("exec", [command], onSuccess, onFail);
	},
	connectUsingProfile(profileId, onSuccess, onFail) {
		invoke("connectUsingProfile", [profileId], onSuccess, onFail);
	},
	testProfile(profileId, requestId, timeout, onSuccess, onFail) {
		invoke("testProfile", [profileId, requestId, timeout], onSuccess, onFail);
	},
	cancelConnection(requestId, onSuccess, onFail) {
		invoke("cancelConnection", [requestId], onSuccess, onFail);
	},
	saveProfile(
		profileId,
		host,
		port,
		username,
		authType,
		password,
		keyFile,
		passphrase,
		onSuccess,
		onFail,
	) {
		invoke(
			"saveProfile",
			[
				profileId,
				host,
				port,
				username,
				authType,
				password,
				keyFile,
				passphrase,
			],
			onSuccess,
			onFail,
		);
	},
	editProfile(
		profileId,
		host,
		port,
		username,
		authType,
		password,
		keyFile,
		passphrase,
		onSuccess,
		onFail,
	) {
		invoke(
			"editProfile",
			[
				profileId,
				host,
				port,
				username,
				authType,
				password,
				keyFile,
				passphrase,
			],
			onSuccess,
			onFail,
		);
	},
	getProfileInfo(profileId, onSuccess, onFail) {
		invoke("getProfileInfo", [profileId], onSuccess, onFail);
	},
	deleteProfile(profileId, onSuccess, onFail) {
		invoke("deleteProfile", [profileId], onSuccess, onFail);
	},
	getFile(filename, localFilename, onSuccess, onFail) {
		invoke("getFile", [filename, localFilename], onSuccess, onFail);
	},
	putFile(filename, localFilename, onSuccess, onFail) {
		invoke("putFile", [filename, localFilename], onSuccess, onFail);
	},
	lsDir(path, onSuccess, onFail) {
		invoke("lsDir", [path], onSuccess, onFail);
	},
	stat(path, onSuccess, onFail) {
		invoke("stat", [path], onSuccess, onFail);
	},
	mkdir(path, onSuccess, onFail) {
		invoke("mkdir", [path], onSuccess, onFail);
	},
	rm(path, force, recurse, onSuccess, onFail) {
		invoke("rm", [path, force, recurse], onSuccess, onFail);
	},
	createFile(path, content, onSuccess, onFail) {
		invoke("createFile", [path, content], onSuccess, onFail);
	},
	rename(oldPath, newPath, onSuccess, onFail) {
		invoke("rename", [oldPath, newPath], onSuccess, onFail);
	},
	pwd(onSuccess, onFail) {
		invoke("pwd", [], onSuccess, onFail);
	},
	close(onSuccess, onFail) {
		invoke("close", [], onSuccess, onFail);
	},
	isConnected(onSuccess, onFail) {
		invoke("isConnected", [], onSuccess, onFail);
	},
	openShellUsingProfile(profileId, cols, rows, onEvent, onFail) {
		invoke("openShellUsingProfile", [profileId, cols, rows], onEvent, onFail);
	},
	writeShell(sessionId, data, onSuccess, onFail) {
		invoke("writeShell", [sessionId, data], onSuccess, onFail);
	},
	resizeShell(sessionId, cols, rows, onSuccess, onFail) {
		invoke("resizeShell", [sessionId, cols, rows], onSuccess, onFail);
	},
	closeShell(sessionId, onSuccess, onFail) {
		invoke("closeShell", [sessionId], onSuccess, onFail);
	},
};

export default nativeSftp;
