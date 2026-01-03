/*
 * Vencord, AutoQuests plugin
 * Automatise les quêtes Discord H24
 * Copyright (c) 2026 Roxxor and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 */

import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { findStore, findByProps } from "@webpack";
import { Devs } from "@utils/constants";

export const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Activer AutoQuests (automatisation des quêtes H24)",
        default: true
    }
});
let questInterval: ReturnType<typeof setInterval> | null = null;

export default definePlugin({
    name: "AutoQuests",
    description: "Automatise les quêtes Discord en tâche de fond",
    authors: [Devs.imroxxor],
    settings,

    start() {
        if (settings.store.enabled) this.startQuestLoop();

        // Vérifie dynamiquement si l'utilisateur active/désactive le plugin
        const checkSettings = () => {
            if (settings.store.enabled && !questInterval) this.startQuestLoop();
            if (!settings.store.enabled && questInterval) this.stopQuestLoop();
            requestAnimationFrame(checkSettings);
        };
        checkSettings();
    },

    stop() {
        this.stopQuestLoop();
    },

    startQuestLoop() {
        if (questInterval) return;

        const QuestsStore = findStore("QuestsStore") || findByProps("getQuest", "quests");
        const RunningGameStore = findStore("RunningGameStore") || findByProps("getRunningGames");
        const ApplicationStreamingStore = findStore("ApplicationStreamingStore") || findByProps("getStreamerActiveStreamMetadata");
        const ChannelStore = findStore("ChannelStore") || findByProps("getAllThreadsForParent");
        const GuildChannelStore = findStore("GuildChannelStore") || findByProps("getSFWDefaultChannel");
        const FluxDispatcher = findStore("FluxDispatcher") || findByProps("subscribe", "dispatch");
        const api = findByProps("get", "post");

        const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];
        const isApp = typeof DiscordNative !== "undefined";

        const doQuests = async () => {
            const allQuests = [...QuestsStore.quests.values()];
            const quests = allQuests.filter(q =>
                q.userStatus?.enrolledAt &&
                !q.userStatus?.completedAt &&
                new Date(q.config.expiresAt).getTime() > Date.now() &&
                supportedTasks.some(t => Object.keys(q.config.taskConfig ?? q.config.taskConfigV2)?.includes(t))
            );

            for (const quest of quests) {
                const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
                const taskName = supportedTasks.find(t => taskConfig.tasks[t])!;
                const secondsNeeded = taskConfig.tasks[taskName].target;
                console.log(`[AutoQuests] Démarrage de la quête ${quest.config.messages.questName} (${taskName})`);

                // VIDEO / MOBILE VIDEO
                if (taskName.includes("VIDEO")) {
                    let progress = quest.userStatus?.progress?.[taskName]?.value ?? 0;
                    while (progress < secondsNeeded) {
                        await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: Math.min(secondsNeeded, progress + 10) } });
                        progress = Math.min(secondsNeeded, progress + 10);
                        await new Promise(r => setTimeout(r, 5000));
                    }
                    console.log(`[AutoQuests] Quête vidéo ${quest.config.messages.questName} complétée !`);
                }

                // PLAY_ON_DESKTOP
                else if (taskName === "PLAY_ON_DESKTOP") {
                    if (!isApp) {
                        console.log(`[AutoQuests] PLAY_ON_DESKTOP nécessite Discord Desktop App pour ${quest.config.messages.questName}`);
                        continue;
                    }
                    // Simulation du jeu
                    const pid = Math.floor(Math.random() * 30000) + 1000;
                    const fakeGame = {
                        id: quest.config.application.id,
                        name: quest.config.application.name,
                        pid,
                        start: Date.now(),
                        processName: quest.config.application.name,
                        cmdLine: "",
                        exeName: quest.config.application.name,
                        exePath: "",
                        hidden: false,
                        isLauncher: false,
                        pidPath: [pid]
                    };
                    const realGames = RunningGameStore.getRunningGames();
                    const realGetRunningGames = RunningGameStore.getRunningGames;
                    const realGetGameForPID = RunningGameStore.getGameForPID;
                    RunningGameStore.getRunningGames = () => [fakeGame];
                    RunningGameStore.getGameForPID = (pid) => fakeGame;

                    FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: [fakeGame] });

                    const unsubscribe = (data: any) => {
                        const progress = Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                        if (progress >= secondsNeeded) {
                            console.log(`[AutoQuests] Quête ${quest.config.messages.questName} complétée !`);
                            RunningGameStore.getRunningGames = realGetRunningGames;
                            RunningGameStore.getGameForPID = realGetGameForPID;
                            FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", unsubscribe);
                        }
                    };
                    FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", unsubscribe);
                }

                // STREAM_ON_DESKTOP
                else if (taskName === "STREAM_ON_DESKTOP") {
                    if (!isApp) {
                        console.log(`[AutoQuests] STREAM_ON_DESKTOP nécessite Discord Desktop App pour ${quest.config.messages.questName}`);
                        continue;
                    }
                    const pid = Math.floor(Math.random() * 30000) + 1000;
                    const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
                    ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({ id: quest.config.application.id, pid, sourceName: null });

                    const unsubscribe = (data: any) => {
                        const progress = Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                        if (progress >= secondsNeeded) {
                            console.log(`[AutoQuests] Quête ${quest.config.messages.questName} complétée !`);
                            ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
                            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", unsubscribe);
                        }
                    };
                    FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", unsubscribe);
                }

                // PLAY_ACTIVITY
                else if (taskName === "PLAY_ACTIVITY") {
                    const guilds = Object.values(GuildChannelStore.getAllGuilds()) as any[];
                    const firstVoiceChannel = guilds.find(g => g?.VOCAL?.length)?.VOCAL[0]?.channel?.id;
                    const channelId = ChannelStore.getSortedPrivateChannels()?.[0]?.id ?? firstVoiceChannel;
                    const streamKey = `call:${channelId}:1`;

                    while (true) {
                        const res = await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: false } });
                        const progress = res.body.progress.PLAY_ACTIVITY.value;
                        console.log(`[AutoQuests] Progression ${progress}/${secondsNeeded}`);
                        if (progress >= secondsNeeded) {
                            await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: true } });
                            console.log(`[AutoQuests] Quête ${quest.config.messages.questName} complétée !`);
                            break;
                        }
                        await new Promise(r => setTimeout(r, 20_000));
                    }
                }
            }
        };

        questInterval = setInterval(doQuests, 60_000);
        doQuests();
    },

    stopQuestLoop() {
        if (questInterval) {
            clearInterval(questInterval);
            questInterval = null;
        }
    }
});