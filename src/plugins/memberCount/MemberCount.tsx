/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getCurrentChannel } from "@utils/discord";
import { isObjectEmpty } from "@utils/misc";
import { ChannelStore, GuildMemberCountStore, PermissionsBits, PermissionStore, SelectedChannelStore, Tooltip, useEffect, useStateFromStores, VoiceStateStore } from "@webpack/common";
import { GuildMemberStore } from "@webpack/common";

import { ChannelMemberStore, cl, numberFormat, settings, ThreadMemberListStore } from ".";
import { CircleIcon } from "./CircleIcon";
import { OnlineMemberCountStore } from "./OnlineMemberCountStore";
import { VoiceIcon } from "./VoiceIcon";

export function MemberCount({ isTooltip, tooltipGuildId }: { isTooltip?: true; tooltipGuildId?: string; }) {
    const { voiceActivity } = settings.use(["voiceActivity"]);
    const includeVoice = voiceActivity && !isTooltip;

    const currentChannel = useStateFromStores([SelectedChannelStore], () => getCurrentChannel());
    const guildId = isTooltip ? tooltipGuildId! : currentChannel?.guild_id;

    const voiceActivityCount = useStateFromStores(
        [VoiceStateStore],
        () => {
            if (!includeVoice) return 0;

            const voiceStates = VoiceStateStore.getVoiceStates(guildId);
            if (!voiceStates) return 0;

            return Object.values(voiceStates)
                .filter(({ channelId }) => {
                    if (!channelId) return false;
                    const channel = ChannelStore.getChannel(channelId);
                    return channel && PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel);
                })
                .length;
        }
    );

    const totalCount = useStateFromStores(
        [GuildMemberCountStore],
        () => GuildMemberCountStore.getMemberCount(guildId!)
    );

    const accessCount = useStateFromStores(
        [GuildMemberStore, ChannelStore, PermissionStore],
        () => {
            if (!guildId || !currentChannel) return null;
    
            const members = GuildMemberStore.getMembers(guildId);
            if (!members) return null;
    
            return Object.values(members).filter(member => {
                const perms = PermissionStore.getChannelPermissions(
                    currentChannel.id,
                    member.userId
                );
    
                return perms?.has(PermissionsBits.VIEW_CHANNEL);
            }).length;
        }
    );

    let onlineCount = useStateFromStores(
        [OnlineMemberCountStore],
        () => OnlineMemberCountStore.getCount(guildId)
    );

    const { groups } = useStateFromStores(
        [ChannelMemberStore],
        () => ChannelMemberStore.getProps(guildId, currentChannel?.id)
    );

    const threadGroups = useStateFromStores(
        [ThreadMemberListStore],
        () => ThreadMemberListStore.getMemberListSections(currentChannel?.id)
    );

    if (!isTooltip && (groups.length >= 1 || groups[0].id !== "unknown")) {
        onlineCount = groups.reduce((total, curr) => total + (curr.id === "offline" ? 0 : curr.count), 0);
    }

    if (!isTooltip && threadGroups && !isObjectEmpty(threadGroups)) {
        onlineCount = Object.values(threadGroups).reduce((total, curr) => total + (curr.sectionId === "offline" ? 0 : curr.userIds.length), 0);
    }

    useEffect(() => {
        OnlineMemberCountStore.ensureCount(guildId);
    }, [guildId]);

    if (totalCount == null)
        return null;

    const formattedVoiceCount = numberFormat(voiceActivityCount ?? 0);
    const formattedOnlineCount = onlineCount != null ? numberFormat(onlineCount) : "?";

    return (
        <div className={cl("widget", { tooltip: isTooltip, "member-list": !isTooltip })}>
            <Tooltip text={`${formattedOnlineCount} online in this channel`} position="bottom">
                {props => (
                    <div {...props} className={cl("container")}>
                        <CircleIcon className={cl("online-count")} />
                        <span className={cl("online")}>{formattedOnlineCount}</span>
                    </div>
                )}
            </Tooltip>
            {accessCount != null &&
                <Tooltip text={`${numberFormat(accessCount)} members have access to this channel`} position="bottom">
                    {props => (
                        <div {...props} className={cl("container")}>
                            <CircleIcon className={cl("access-count")} />
                            <span className={cl("access")}>
                                {numberFormat(accessCount)}
                            </span>
                        </div>
                    )}
                </Tooltip>
            }
            <Tooltip text={`${numberFormat(totalCount)} total server members`} position="bottom">
                {props => (
                    <div {...props} className={cl("container")}>
                        <CircleIcon className={cl("total-count")} />
                        <span className={cl("total")}>{numberFormat(totalCount)}</span>
                    </div>
                )}
            </Tooltip>
            {includeVoice && voiceActivityCount > 0 &&
                <Tooltip text={`${formattedVoiceCount} members in voice`} position="bottom">
                    {props => (
                        <div {...props} className={cl("container")}>
                            <VoiceIcon className={cl("voice-icon")} />
                            <span className={cl("voice")}>{formattedVoiceCount}</span>
                        </div>
                    )}
                </Tooltip>
            }
        </div>
    );
}
