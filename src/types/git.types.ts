/**
 * Git-specific type definitions for GitPilot extension
 */

export interface ICommitOptions {
    message: string;
    files: string[];
}

export interface IFileStatus {
    path: string;
    index: string;
    workingDir: string;
    isConflicted: boolean;
}

export interface IBranchInfo {
    current: string;
    all: string[];
    remote?: string[];
}

export interface ICommitInfo {
    hash: string;
    message: string;
    author: string;
    date: string;
}

export interface IStashInfo {
    index: number;
    message: string;
    hash: string;
    date: string;
}

export interface IGitStatus {
    files: IFileStatus[];
    current: string | null;
    tracking: string | null;
    ahead: number;
    behind: number;
    conflicted: string[];
    created: string[];
    deleted: string[];
    modified: string[];
    renamed: string[];
    staged: string[];
    added: string[];
    untracked: string[];
}

export interface IGitError extends Error {
    code?: string;
    command?: string;
    gitErrorCode?: number;
}