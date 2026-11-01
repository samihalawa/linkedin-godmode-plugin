import { z } from "zod";
import { type ProviderName } from "./schemas.js";
declare const FileConfigSchema: z.ZodObject<{
    stateDir: z.ZodOptional<z.ZodString>;
    profileDir: z.ZodOptional<z.ZodString>;
    localCdpUrl: z.ZodOptional<z.ZodString>;
    defaultProvider: z.ZodOptional<z.ZodEnum<{
        anchor: "anchor";
        browserbase: "browserbase";
        local: "local";
    }>>;
    defaultSession: z.ZodOptional<z.ZodString>;
    headless: z.ZodOptional<z.ZodBoolean>;
    readOnly: z.ZodOptional<z.ZodBoolean>;
    hostAllowlist: z.ZodOptional<z.ZodArray<z.ZodString>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    maxOutputBytes: z.ZodOptional<z.ZodNumber>;
    maxResponseBytes: z.ZodOptional<z.ZodNumber>;
    aliases: z.ZodOptional<z.ZodObject<{
        sessions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            provider: z.ZodEnum<{
                anchor: "anchor";
                browserbase: "browserbase";
                local: "local";
            }>;
            profile: z.ZodOptional<z.ZodString>;
            providerSessionId: z.ZodOptional<z.ZodString>;
            persistentRef: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        browserbaseContexts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        anchorProfiles: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strict>>;
    browserbase: z.ZodOptional<z.ZodObject<{
        projectId: z.ZodOptional<z.ZodString>;
        region: z.ZodOptional<z.ZodEnum<{
            "ap-southeast-1": "ap-southeast-1";
            "eu-central-1": "eu-central-1";
            "us-east-1": "us-east-1";
            "us-west-2": "us-west-2";
        }>>;
        baseUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    anchor: z.ZodOptional<z.ZodObject<{
        baseUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type FileConfig = z.infer<typeof FileConfigSchema>;
export interface RuntimeConfig {
    configFile: string;
    stateDir: string;
    profileDir: string;
    localCdpUrl?: string;
    defaultProvider: ProviderName;
    defaultSession?: string;
    headless: boolean;
    readOnly: boolean;
    hostAllowlist: string[];
    timeoutMs: number;
    maxOutputBytes: number;
    maxResponseBytes: number;
    aliases: NonNullable<FileConfig["aliases"]>;
    browserbase: NonNullable<FileConfig["browserbase"]>;
    anchor: NonNullable<FileConfig["anchor"]>;
}
export declare function ensurePrivateDirectory(directory: string): Promise<void>;
export declare function resolveConfig(explicitFile?: string): Promise<RuntimeConfig>;
export declare function getProviderSecret(provider: "browserbase" | "anchor"): string;
export declare function directoryMode(directory: string): Promise<string>;
export {};
