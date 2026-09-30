import type { UnitSummary } from "@molo/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { MistakesCard } from "~/components/MistakesCard.tsx";
import { ProgressStrip } from "~/components/ProgressStrip.tsx";
import { DEMO_UNIT_SLUG, demoUnit } from "~/fixtures/demo-unit.ts";
import { getCrown } from "~/lib/api.ts";
import { useContentTitle, useLang, useT } from "~/lib/i18n.tsx";
import { usePrefetchFromHome } from "~/lib/prefetch.ts";
import { useMe } from "~/lib/session.tsx";
import { downloadKey, useDownloads } from "~/lib/use-downloads.ts";
import { useGuest } from "~/lib/use-guest.tsx";
import { useUnitLocks, type UnitLock } from "~/lib/use-locks.ts";
import { ONBOARDED_KEY, useOnboarded } from "~/lib/use-onboarded.ts";
import { useUnitList } from "~/lib/use-units.ts";
import { Button } from "~/ui/Button.tsx";
import { Card } from "~/ui/Card.tsx";
import { Penguin } from "~/ui/Mascots.tsx";
import { ProgressRing } from "~/ui/ProgressRing.tsx";
import { HeaderSkeleton, HomeSkeleton, UnitCardsSkeleton } from "~/ui/Skeleton.tsx";
import { colors } from "~/ui/theme.ts";

function UnitCard({
  unit,
  index,
  signedIn,
  lock,
}: {
  unit: UnitSummary;
  index: number;
  signedIn: boolean;
  lock: UnitLock;
}) {
  const t = useT();
  const title = useContentTitle();
  const { lang } = useLang();
  const router = useRouter();
  const isDemo = unit.slug === DEMO_UNIT_SLUG;
  // Which units work with no signal is the thing a tourist most needs to see
  // before they leave the wifi, so it sits on the card, not in settings.
  const downloaded = useDownloads().ready.has(downloadKey(unit.slug, lang));
  const crown = useQuery({
    queryKey: ["crown", unit.slug],
    queryFn: () => getCrown(unit.slug),
    enabled: signedIn && !isDemo && !lock.locked,
    staleTime: 60_000,
  });
  const mastery = crown.data && crown.data.total > 0 ? crown.data.mature / crown.data.total : 0;
  const name = title(unit.titleKey, unit.slug);
  // A locked unit goes quiet: sand instead of cloud, mist text, a padlock in
  // place of the mastery ring, and the card says which unit opens it.
  const prerequisite = lock.prerequisiteTitleKey
    ? title(lock.prerequisiteTitleKey, lock.prerequisiteSlug ?? "")
    : (lock.prerequisiteSlug ?? "");
  const hint = t("units.lockedHint", { unit: prerequisite });
  return (
    <Card index={index} tone={lock.locked ? "sand" : crown.data?.crowned ? "sun" : "cloud"}>
      <View className="flex-row items-center gap-4">
        {lock.locked ? (
          <View
            className="h-16 w-16 items-center justify-center rounded-full bg-cloud"
            accessible
            accessibilityLabel={`${t("units.locked")}: ${hint}`}
            testID={`locked-${unit.slug}`}
          >
            <Text className="font-display-bold text-2xl text-mist">🔒</Text>
          </View>
        ) : (
          <ProgressRing
            value={mastery}
            size={64}
            stroke={7}
            color={crown.data?.crowned ? colors.ochre : colors.sea}
            accessibilityLabel={
              crown.data && crown.data.total > 0
                ? t("units.crown", { mature: crown.data.mature, total: crown.data.total })
                : name
            }
          >
            <Text className="font-display-bold text-lg text-ink">
              {crown.data?.crowned ? "👑" : index + 1}
            </Text>
          </ProgressRing>
        )}
        <View className="flex-1">
          <Text className="font-body-bold text-xs uppercase tracking-wide text-mist">
            {unit.cefrBand}
            {isDemo ? ` · ${t("units.sample")}` : ""}
            {downloaded ? ` · ${t("units.downloaded")}` : ""}
          </Text>
          <Text className={`font-display text-xl ${lock.locked ? "text-mist" : "text-ink"}`}>
            {name}
          </Text>
          {lock.locked ? (
            <Text className="font-body text-sm text-mist">{hint}</Text>
          ) : (
            crown.data &&
            crown.data.total > 0 && (
              <Text className="font-body text-sm text-mist">
                {t("units.crown", { mature: crown.data.mature, total: crown.data.total })}
              </Text>
            )
          )}
        </View>
      </View>
      <View className="mt-4 items-start">
        <Button
          label={lock.locked ? t("units.locked") : t("units.start")}
          variant={lock.locked ? "cloud" : "sun"}
          disabled={lock.locked}
          onPress={() => {
            // A locked unit never navigates; the hint on the card is the answer.
            if (lock.locked) return;
            router.push({ pathname: "/learn/[slug]", params: { slug: unit.slug } });
          }}
          accessibilityLabel={lock.locked ? hint : `${t("units.start")}: ${name}`}
          testID={`start-${unit.slug}`}
        />
      </View>
    </Card>
  );
}

/**
 * Home: the greeting as the large title, the progress strip, then the path
 * of published units (the API guarantees that). Review, leagues and
 * settings live on their tabs, so nothing here repeats them. A __DEV__
 * sample unit is appended so the runner can be exercised before anything
 * is published.
 */
export default function Home() {
  const t = useT();
  const router = useRouter();
  const me = useMe();
  const qc = useQueryClient();
  // Drawn at once from the device's last copy while the network answers.
  const units = useUnitList();
  const onboarded = useOnboarded();
  const guest = useGuest();
  const rows: UnitSummary[] = [...(units.data?.units ?? []), ...(__DEV__ ? [demoUnit().unit] : [])];
  const signedIn = !!me.data;
  const locks = useUnitLocks(rows);
  // The unit that holds the next lesson, and the review session, before a tap.
  usePrefetchFromHome(units.data?.units);

  // `onboardedFrom` answers yes whenever the device flag is set, whatever the
  // server says, so a phone that finished the welcome flow draws the path
  // without waiting for /me.
  const ready = onboarded ?? (qc.getQueryData<boolean>(ONBOARDED_KEY) === true ? true : null);
  // First run: the welcome flow, skippable at every step.
  if (ready === null) return <HomeSkeleton />;
  if (!ready) return <Redirect href="/welcome" />;

  // The greeting is the stack's large title; the header collapses as the path scrolls.
  return (
    <ScrollView
      className="flex-1 bg-sand"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="px-5 pb-10 gap-4"
    >
      {/* Until the app knows who is signed in, neither the greeting nor the
          sign-in card: one of them would be wrong. */}
      {me.isPending ? (
        <HeaderSkeleton />
      ) : (
        <Text className="mt-1 font-body text-base text-mist">
          {signedIn ? t("home.welcomeBack", { name: me.data?.user.name ?? "" }) : t("app.tagline")}
        </Text>
      )}

      {me.isPending ? null : signedIn ? (
        <ProgressStrip />
      ) : guest.walled ? (
        // The guest has XP to lose: the banner sells the account with what they already earned.
        <Card tone="sun">
          <View className="flex-row items-center gap-3" testID="guest-banner">
            <View className="flex-1">
              <Text className="font-display text-lg text-ink">
                {t("guest.banner", { xp: guest.xp })}
              </Text>
              <Text className="mt-1 font-body text-sm text-ink/70">{t("guest.keep")}</Text>
            </View>
            <Penguin pose="cheer" size={76} />
          </View>
          <View className="mt-4 flex-row flex-wrap items-center gap-2">
            <Button
              label={t("guest.create")}
              variant="indigo"
              onPress={() => router.push({ pathname: "/auth", params: { mode: "signup" } })}
              testID="guest-create"
            />
            <Button
              label={t("guest.haveAccount")}
              variant="ghost"
              onPress={() => router.push("/auth")}
              testID="guest-sign-in"
            />
          </View>
        </Card>
      ) : (
        <Card tone="indigo">
          <Text className="font-display text-lg text-cloud">{t("auth.welcome")}</Text>
          <Text className="mb-4 mt-1 font-body text-sm text-cloud/80">{t("home.signInHint")}</Text>
          <View className="items-start">
            <Button
              label={t("nav.signIn")}
              variant="sun"
              onPress={() => router.push("/auth")}
              testID="go-sign-in"
            />
          </View>
        </Card>
      )}

      <MistakesCard />

      <Text className="mt-2 font-display text-2xl text-indigo">{t("home.path")}</Text>
      {units.isPending && <UnitCardsSkeleton />}
      {/* Offline or the API down: say so and offer a retry, never an empty path
          that reads as "no course". */}
      {units.isError && !__DEV__ && (
        <View className="items-start gap-3 rounded-3xl bg-cloud p-5" testID="units-error">
          <Text className="font-body-semibold text-base text-ink">{t("units.loadError")}</Text>
          <Button
            label={units.isFetching ? t("common.loading") : t("common.retry")}
            variant="sun"
            disabled={units.isFetching}
            onPress={() => void units.refetch()}
            testID="units-retry"
          />
        </View>
      )}
      {!units.isPending && !units.isError && rows.length === 0 && (
        <View className="items-center gap-3 rounded-3xl border-2 border-dashed border-cloud-deep p-6">
          <Penguin pose="think" size={120} />
          <Text className="text-center font-body text-base text-mist">{t("units.empty")}</Text>
        </View>
      )}
      {rows.map((u, i) => (
        <UnitCard key={u.id} unit={u} index={i} signedIn={signedIn} lock={locks.lockOf(u)} />
      ))}

      {/* The reference is reachable at any time, not only from inside a
          lesson (docs/GRAMMAR.md section 1). */}
      <View className="mt-2 items-start">
        <Button
          label={t("grammar.openReference")}
          variant="cloud"
          onPress={() => router.push("/grammar")}
          testID="open-grammar"
        />
      </View>
    </ScrollView>
  );
}
