/**
 * Represents blame information for a specific line
 */
export interface BlameInfo {
    line: number;
    commit: string;
    author: string;
    authorEmail: string;
    date: string;
    summary: string;
    content: string;
    previousCommit?: string;
    previousFile?: string;
}

/**
 * Represents full blame data for a file
 */
export interface FileBlameData {
    [lineNumber: number]: BlameInfo;
}

/**
 * Commit details for blame/history views
 */
export interface CommitDetails {
    hash: string;
    author: string;
    authorEmail: string;
    date: string;
    message: string;
    files: CommitFileChange[];
    parents: string[];
}

/**
 * File change in a commit
 */
export interface CommitFileChange {
    path: string;
    status: 'A' | 'M' | 'D' | 'R' | 'C'; // Added, Modified, Deleted, Renamed, Copied
    additions: number;
    deletions: number;
    oldPath?: string; // For renames
}

/**
 * Line history entry
 */
export interface LineHistoryEntry {
    hash: string;
    author: string;
    date: string;
    message: string;
    lineNumber: number;
    content: string;
}