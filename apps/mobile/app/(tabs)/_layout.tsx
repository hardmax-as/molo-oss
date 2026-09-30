import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useState } from "react";

import { useProgress } from "~/components/ProgressStrip.tsx";
import { canReview } from "~/lib/editor-access.ts";
import { useT } from "~/lib/i18n.tsx";
import { useMe } from "~/lib/session.tsx";
import { TabBarContext } from "~/lib/tab-bar.tsx";
import { liquidGlassOS } from "~/ui/stack-options.ts";
import { colors, fonts } from "~/ui/theme.ts";

/**
 * The system tab bar. On iOS 26 it is Liquid Glass and takes its background
 * from the content behind it; `backgroundColor` and `blurEffect` only reach
 * iOS 18 and earlier, where they approximate the sand palette. Each tab
 * hosts its own native Stack for headers and pushed screens.
 */
export default function TabsLayout() {
  const t = useT();
  const me = useMe();
  const [hidden, setHidden] = useState(false);
  const progress = useProgress();
  const due = progress.data?.dueCount ?? 0;
  return (
    <TabBarContext.Provider value={setHidden}>
      <NativeTabs
        hidden={hidden}
        minimizeBehavior="onScrollDown"
        tintColor={colors.indigo}
        iconColor={{ default: colors.mist, selected: colors.indigo }}
        labelStyle={{ fontFamily: fonts.bodySemibold, fontSize: 11 }}
        badgeBackgroundColor={colors.coral}
        // Android: Material hides the label of unselected tabs by default;
        // four destinations with one visible name is a guessing game, so
        // every tab keeps its label. The pill behind the active icon and
        // the press ripple take the palette instead of Material's lavender.
        labelVisibilityMode="labeled"
        indicatorColor={colors.sandDeep}
        rippleColor={colors.sandDeep}
        {...(liquidGlassOS
          ? {}
          : {
              backgroundColor: "rgba(255, 247, 232, 0.88)",
              blurEffect: "systemChromeMaterialLight",
            })}
      >
        <NativeTabs.Trigger name="(learn)">
          <NativeTabs.Trigger.Icon sf="book.fill" md="menu_book" />
          <NativeTabs.Trigger.Label>{t("nav.learn")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="review">
          <NativeTabs.Trigger.Icon sf="arrow.clockwise" md="refresh" />
          <NativeTabs.Trigger.Label>{t("review.title")}</NativeTabs.Trigger.Label>
          {due > 0 && <NativeTabs.Trigger.Badge>{String(due)}</NativeTabs.Trigger.Badge>}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="leagues">
          <NativeTabs.Trigger.Icon sf="trophy.fill" md="emoji_events" />
          <NativeTabs.Trigger.Label>{t("leagues.title")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="editor" hidden={!canReview(me.data)}>
          <NativeTabs.Trigger.Icon sf="checkmark.bubble.fill" md="fact_check" />
          <NativeTabs.Trigger.Label>{t("edit.tabs.review")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
          <NativeTabs.Trigger.Label>{t("settings.title")}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </TabBarContext.Provider>
  );
}
