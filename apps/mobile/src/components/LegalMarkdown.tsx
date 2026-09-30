import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";

import { inline } from "../../../../packages/brand/src/legal-markdown.ts";

function Inline({ text }: { text: string }) {
  return inline(text).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : "b" in part ? (
      <Text key={i} className="font-body-bold">
        {part.b}
      </Text>
    ) : "i" in part ? (
      <Text key={i} style={{ fontStyle: "italic" }}>
        {part.i}
      </Text>
    ) : (
      <Text
        key={i}
        accessibilityRole="link"
        className="text-indigo underline"
        onPress={() =>
          void WebBrowser.openBrowserAsync(new URL(part.href, "https://hellomolo.com").href)
        }
      >
        {part.label}
      </Text>
    ),
  );
}

/** The same restricted Markdown syntax as the web legal pages; no remote content. */
export function LegalMarkdown({ source }: { source: string }) {
  return (
    <View className="gap-4">
      {source
        .trim()
        .split(/\n\s*\n/)
        .map((block, i) => {
          if (block.startsWith("# ") || block.startsWith("## "))
            return (
              <Text key={i} accessibilityRole="header" className="font-display text-xl text-indigo">
                {block.replace(/^##? /, "")}
              </Text>
            );
          return (
            <Text key={i} className="font-body text-base text-ink">
              <Inline text={block.replace(/\n/g, " ")} />
            </Text>
          );
        })}
    </View>
  );
}
