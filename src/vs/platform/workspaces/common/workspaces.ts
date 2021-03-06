/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { URI, UriComponents } from 'vs/base/common/uri';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { extname } from 'vs/base/common/path';
import { dirname, resolvePath, isEqualAuthority, isEqualOrParent, relativePath, extname as resourceExtname } from 'vs/base/common/resources';
import * as jsonEdit from 'vs/base/common/jsonEdit';
import * as json from 'vs/base/common/json';
import { Schemas } from 'vs/base/common/network';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { toSlashes } from 'vs/base/common/extpath';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { ILogService } from 'vs/platform/log/common/log';
import { Event as CommonEvent } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const WORKSPACE_EXTENSION = 'code-workspace';
export const WORKSPACE_FILTER = [{ name: localize('codeWorkspace', "Code Workspace"), extensions: [WORKSPACE_EXTENSION] }];
export const UNTITLED_WORKSPACE_NAME = 'workspace.json';

export const IWorkspacesService = createDecorator<IWorkspacesService>('workspacesService');

export interface IWorkspacesService {

	_serviceBrand: undefined;

	// Management
	enterWorkspace(path: URI): Promise<IEnterWorkspaceResult | null>;
	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier>;
	deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void>;
	getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier>;

	// History
	readonly onRecentlyOpenedChange: CommonEvent<void>;
	addRecentlyOpened(recents: IRecent[]): Promise<void>;
	removeFromRecentlyOpened(workspaces: URI[]): Promise<void>;
	clearRecentlyOpened(): Promise<void>;
	getRecentlyOpened(): Promise<IRecentlyOpened>;
}

export interface IRecentlyOpened {
	workspaces: Array<IRecentWorkspace | IRecentFolder>;
	files: IRecentFile[];
}

export type IRecent = IRecentWorkspace | IRecentFolder | IRecentFile;

export interface IRecentWorkspace {
	workspace: IWorkspaceIdentifier;
	label?: string;
}

export interface IRecentFolder {
	folderUri: ISingleFolderWorkspaceIdentifier;
	label?: string;
}

export interface IRecentFile {
	fileUri: URI;
	label?: string;
}

export function isRecentWorkspace(curr: IRecent): curr is IRecentWorkspace {
	return curr.hasOwnProperty('workspace');
}

export function isRecentFolder(curr: IRecent): curr is IRecentFolder {
	return curr.hasOwnProperty('folderUri');
}

export function isRecentFile(curr: IRecent): curr is IRecentFile {
	return curr.hasOwnProperty('fileUri');
}

/**
 * A single folder workspace identifier is just the path to the folder.
 */
export type ISingleFolderWorkspaceIdentifier = URI;

export interface IWorkspaceIdentifier {
	id: string;
	configPath: URI;
}

export function reviveWorkspaceIdentifier(workspace: { id: string, configPath: UriComponents; }): IWorkspaceIdentifier {
	return { id: workspace.id, configPath: URI.revive(workspace.configPath) };
}

export function isStoredWorkspaceFolder(thing: any): thing is IStoredWorkspaceFolder {
	return isRawFileWorkspaceFolder(thing) || isRawUriWorkspaceFolder(thing);
}

export function isRawFileWorkspaceFolder(thing: any): thing is IRawFileWorkspaceFolder {
	return thing
		&& typeof thing === 'object'
		&& typeof thing.path === 'string'
		&& (!thing.name || typeof thing.name === 'string');
}

export function isRawUriWorkspaceFolder(thing: any): thing is IRawUriWorkspaceFolder {
	return thing
		&& typeof thing === 'object'
		&& typeof thing.uri === 'string'
		&& (!thing.name || typeof thing.name === 'string');
}

export interface IRawFileWorkspaceFolder {
	path: string;
	name?: string;
}

export interface IRawUriWorkspaceFolder {
	uri: string;
	name?: string;
}

export type IStoredWorkspaceFolder = IRawFileWorkspaceFolder | IRawUriWorkspaceFolder;

export interface IResolvedWorkspace extends IWorkspaceIdentifier {
	folders: IWorkspaceFolder[];
	remoteAuthority?: string;
}

export interface IStoredWorkspace {
	folders: IStoredWorkspaceFolder[];
	remoteAuthority?: string;
}

export interface IWorkspaceFolderCreationData {
	uri: URI;
	name?: string;
}

export interface IUntitledWorkspaceInfo {
	workspace: IWorkspaceIdentifier;
	remoteAuthority?: string;
}

export interface IEnterWorkspaceResult {
	workspace: IWorkspaceIdentifier;
	backupPath?: string;
}

export function isSingleFolderWorkspaceIdentifier(obj: any): obj is ISingleFolderWorkspaceIdentifier {
	return obj instanceof URI;
}

export function isWorkspaceIdentifier(obj: any): obj is IWorkspaceIdentifier {
	const workspaceIdentifier = obj as IWorkspaceIdentifier;

	return workspaceIdentifier && typeof workspaceIdentifier.id === 'string' && workspaceIdentifier.configPath instanceof URI;
}

export function toWorkspaceIdentifier(workspace: IWorkspace): IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined {
	if (workspace.configuration) {
		return {
			configPath: workspace.configuration,
			id: workspace.id
		};
	}
	if (workspace.folders.length === 1) {
		return workspace.folders[0].uri;
	}

	// Empty workspace
	return undefined;
}

export function isUntitledWorkspace(path: URI, environmentService: IEnvironmentService): boolean {
	return isEqualOrParent(path, environmentService.untitledWorkspacesHome);
}

export type IMultiFolderWorkspaceInitializationPayload = IWorkspaceIdentifier;
export interface ISingleFolderWorkspaceInitializationPayload { id: string; folder: ISingleFolderWorkspaceIdentifier; }
export interface IEmptyWorkspaceInitializationPayload { id: string; }

export type IWorkspaceInitializationPayload = IMultiFolderWorkspaceInitializationPayload | ISingleFolderWorkspaceInitializationPayload | IEmptyWorkspaceInitializationPayload;

export function isSingleFolderWorkspaceInitializationPayload(obj: any): obj is ISingleFolderWorkspaceInitializationPayload {
	return isSingleFolderWorkspaceIdentifier((obj.folder as ISingleFolderWorkspaceIdentifier));
}

const WORKSPACE_SUFFIX = '.' + WORKSPACE_EXTENSION;

export function hasWorkspaceFileExtension(path: string | URI) {
	const ext = (typeof path === 'string') ? extname(path) : resourceExtname(path);

	return ext === WORKSPACE_SUFFIX;
}

const SLASH = '/';

/**
 * Given a folder URI and the workspace config folder, computes the IStoredWorkspaceFolder using
* a relative or absolute path or a uri.
 * Undefined is returned if the folderURI and the targetConfigFolderURI don't have the same schema or authority
 *
 * @param folderURI a workspace folder
 * @param folderName a workspace name
 * @param targetConfigFolderURI the folder where the workspace is living in
 * @param useSlashForPath if set, use forward slashes for file paths on windows
 */
export function getStoredWorkspaceFolder(folderURI: URI, folderName: string | undefined, targetConfigFolderURI: URI, useSlashForPath = !isWindows): IStoredWorkspaceFolder {

	if (folderURI.scheme !== targetConfigFolderURI.scheme) {
		return { name: folderName, uri: folderURI.toString(true) };
	}

	let folderPath: string | undefined;
	if (isEqualOrParent(folderURI, targetConfigFolderURI)) {
		// use relative path
		folderPath = relativePath(targetConfigFolderURI, folderURI) || '.'; // always uses forward slashes
		if (isWindows && folderURI.scheme === Schemas.file && !useSlashForPath) {
			// Windows gets special treatment:
			// - use backslahes unless slash is used by other existing folders
			folderPath = folderPath.replace(/\//g, '\\');
		}
	} else {
		// use absolute path
		if (folderURI.scheme === Schemas.file) {
			folderPath = folderURI.fsPath;
			if (isWindows) {
				// Windows gets special treatment:
				// - normalize all paths to get nice casing of drive letters
				// - use backslahes unless slash is used by other existing folders
				folderPath = normalizeDriveLetter(folderPath);
				if (useSlashForPath) {
					folderPath = toSlashes(folderPath);
				}
			}
		} else {
			if (!isEqualAuthority(folderURI.authority, targetConfigFolderURI.authority)) {
				return { name: folderName, uri: folderURI.toString(true) };
			}
			folderPath = folderURI.path;
		}
	}
	return { name: folderName, path: folderPath };
}

/**
 * Rewrites the content of a workspace file to be saved at a new location.
 * Throws an exception if file is not a valid workspace file
 */
export function rewriteWorkspaceFileForNewLocation(rawWorkspaceContents: string, configPathURI: URI, targetConfigPathURI: URI) {
	let storedWorkspace = doParseStoredWorkspace(configPathURI, rawWorkspaceContents);

	const sourceConfigFolder = dirname(configPathURI);
	const targetConfigFolder = dirname(targetConfigPathURI);

	const rewrittenFolders: IStoredWorkspaceFolder[] = [];
	const slashForPath = useSlashForPath(storedWorkspace.folders);

	// Rewrite absolute paths to relative paths if the target workspace folder
	// is a parent of the location of the workspace file itself. Otherwise keep
	// using absolute paths.
	for (const folder of storedWorkspace.folders) {
		let folderURI = isRawFileWorkspaceFolder(folder) ? resolvePath(sourceConfigFolder, folder.path) : URI.parse(folder.uri);
		rewrittenFolders.push(getStoredWorkspaceFolder(folderURI, folder.name, targetConfigFolder, slashForPath));
	}

	// Preserve as much of the existing workspace as possible by using jsonEdit
	// and only changing the folders portion.
	const formattingOptions: FormattingOptions = { insertSpaces: false, tabSize: 4, eol: (isLinux || isMacintosh) ? '\n' : '\r\n' };
	const edits = jsonEdit.setProperty(rawWorkspaceContents, ['folders'], rewrittenFolders, formattingOptions);
	let newContent = jsonEdit.applyEdits(rawWorkspaceContents, edits);

	if (storedWorkspace.remoteAuthority === getRemoteAuthority(targetConfigPathURI)) {
		// unsaved remote workspaces have the remoteAuthority set. Remove it when no longer nexessary.
		newContent = jsonEdit.applyEdits(newContent, jsonEdit.removeProperty(newContent, ['remoteAuthority'], formattingOptions));
	}
	return newContent;
}

function doParseStoredWorkspace(path: URI, contents: string): IStoredWorkspace {

	// Parse workspace file
	let storedWorkspace: IStoredWorkspace = json.parse(contents); // use fault tolerant parser

	// Filter out folders which do not have a path or uri set
	if (storedWorkspace && Array.isArray(storedWorkspace.folders)) {
		storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
	} else {
		throw new Error(`${path} looks like an invalid workspace file.`);
	}

	return storedWorkspace;
}

export function useSlashForPath(storedFolders: IStoredWorkspaceFolder[]): boolean {
	if (isWindows) {
		return storedFolders.some(folder => isRawFileWorkspaceFolder(folder) && folder.path.indexOf(SLASH) >= 0);
	}
	return true;
}

//#region Workspace Storage

interface ISerializedRecentlyOpened {
	workspaces3: Array<ISerializedWorkspace | string>; // workspace or URI.toString() // added in 1.32
	workspaceLabels?: Array<string | null>; // added in 1.33
	files2: string[]; // files as URI.toString() // added in 1.32
	fileLabels?: Array<string | null>; // added in 1.33
}

interface ILegacySerializedRecentlyOpened {
	workspaces2: Array<ILegacySerializedWorkspace | string>; // legacy, configPath as file path
	workspaces: Array<ILegacySerializedWorkspace | string | UriComponents>; // legacy (UriComponents was also supported for a few insider builds)
	files: string[]; // files as paths
}

interface ISerializedWorkspace { id: string; configURIPath: string; }
interface ILegacySerializedWorkspace { id: string; configPath: string; }

function isLegacySerializedWorkspace(curr: any): curr is ILegacySerializedWorkspace {
	return typeof curr === 'object' && typeof curr['id'] === 'string' && typeof curr['configPath'] === 'string';
}

function isUriComponents(curr: any): curr is UriComponents {
	return curr && typeof curr['path'] === 'string' && typeof curr['scheme'] === 'string';
}

export type RecentlyOpenedStorageData = object;

export function restoreRecentlyOpened(data: RecentlyOpenedStorageData | undefined, logService: ILogService): IRecentlyOpened {
	const result: IRecentlyOpened = { workspaces: [], files: [] };
	if (data) {
		const restoreGracefully = function <T>(entries: T[], func: (entry: T, index: number) => void) {
			for (let i = 0; i < entries.length; i++) {
				try {
					func(entries[i], i);
				} catch (e) {
					logService.warn(`Error restoring recent entry ${JSON.stringify(entries[i])}: ${e.toString()}. Skip entry.`);
				}
			}
		};

		const storedRecents = data as ISerializedRecentlyOpened & ILegacySerializedRecentlyOpened;
		if (Array.isArray(storedRecents.workspaces3)) {
			restoreGracefully(storedRecents.workspaces3, (workspace, i) => {
				const label: string | undefined = (Array.isArray(storedRecents.workspaceLabels) && storedRecents.workspaceLabels[i]) || undefined;
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configURIPath === 'string') {
					result.workspaces.push({ label, workspace: { id: workspace.id, configPath: URI.parse(workspace.configURIPath) } });
				} else if (typeof workspace === 'string') {
					result.workspaces.push({ label, folderUri: URI.parse(workspace) });
				}
			});
		} else if (Array.isArray(storedRecents.workspaces2)) {
			restoreGracefully(storedRecents.workspaces2, workspace => {
				if (typeof workspace === 'object' && typeof workspace.id === 'string' && typeof workspace.configPath === 'string') {
					result.workspaces.push({ workspace: { id: workspace.id, configPath: URI.file(workspace.configPath) } });
				} else if (typeof workspace === 'string') {
					result.workspaces.push({ folderUri: URI.parse(workspace) });
				}
			});
		} else if (Array.isArray(storedRecents.workspaces)) {
			// TODO@martin legacy support can be removed at some point (6 month?)
			// format of 1.25 and before
			restoreGracefully(storedRecents.workspaces, workspace => {
				if (typeof workspace === 'string') {
					result.workspaces.push({ folderUri: URI.file(workspace) });
				} else if (isLegacySerializedWorkspace(workspace)) {
					result.workspaces.push({ workspace: { id: workspace.id, configPath: URI.file(workspace.configPath) } });
				} else if (isUriComponents(workspace)) {
					// added by 1.26-insiders
					result.workspaces.push({ folderUri: URI.revive(<UriComponents>workspace) });
				}
			});
		}
		if (Array.isArray(storedRecents.files2)) {
			restoreGracefully(storedRecents.files2, (file, i) => {
				const label: string | undefined = (Array.isArray(storedRecents.fileLabels) && storedRecents.fileLabels[i]) || undefined;
				if (typeof file === 'string') {
					result.files.push({ label, fileUri: URI.parse(file) });
				}
			});
		} else if (Array.isArray(storedRecents.files)) {
			restoreGracefully(storedRecents.files, file => {
				if (typeof file === 'string') {
					result.files.push({ fileUri: URI.file(file) });
				}
			});
		}
	}

	return result;
}

export function toStoreData(recents: IRecentlyOpened): RecentlyOpenedStorageData {
	const serialized: ISerializedRecentlyOpened = { workspaces3: [], files2: [] };

	let hasLabel = false;
	const workspaceLabels: (string | null)[] = [];
	for (const recent of recents.workspaces) {
		if (isRecentFolder(recent)) {
			serialized.workspaces3.push(recent.folderUri.toString());
		} else {
			serialized.workspaces3.push({ id: recent.workspace.id, configURIPath: recent.workspace.configPath.toString() });
		}
		workspaceLabels.push(recent.label || null);
		hasLabel = hasLabel || !!recent.label;
	}
	if (hasLabel) {
		serialized.workspaceLabels = workspaceLabels;
	}

	hasLabel = false;
	const fileLabels: (string | null)[] = [];
	for (const recent of recents.files) {
		serialized.files2.push(recent.fileUri.toString());
		fileLabels.push(recent.label || null);
		hasLabel = hasLabel || !!recent.label;
	}
	if (hasLabel) {
		serialized.fileLabels = fileLabels;
	}

	return serialized;
}

//#endregion
