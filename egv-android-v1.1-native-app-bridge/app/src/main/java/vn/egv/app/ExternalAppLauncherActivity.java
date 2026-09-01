package vn.egv.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Opens an allow-listed AI application on behalf of the E-GV TWA. */
public final class ExternalAppLauncherActivity extends Activity {
    private static final Set<String> ALLOWED_PACKAGES = Collections.unmodifiableSet(
            new HashSet<>(Arrays.asList(
                    "com.openai.chatgpt",
                    "com.google.android.apps.bard",
                    "com.anthropic.claude",
                    "com.google.android.apps.labs.language.tailwind",
                    "ai.x.grok",
                    "com.microsoft.copilot",
                    "com.deepseek.chat",
                    "com.canva.editor",
                    "ai.perplexity.app.android",
                    "com.suno.android"
            ))
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent sourceIntent = getIntent();
        Uri data = sourceIntent == null ? null : sourceIntent.getData();
        if (data == null) {
            finish();
            return;
        }

        String packageName = data.getQueryParameter("package");
        String fallbackUrl = data.getQueryParameter("fallback");
        if (packageName == null || !ALLOWED_PACKAGES.contains(packageName)) {
            finish();
            return;
        }

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(packageName);
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            try {
                startActivity(launchIntent);
                finish();
                return;
            } catch (ActivityNotFoundException ignored) {
                // Continue to the verified web fallback below.
            }
        }

        openWebFallback(fallbackUrl);
        finish();
    }

    private void openWebFallback(String fallbackUrl) {
        if (fallbackUrl == null || !(fallbackUrl.startsWith("https://") || fallbackUrl.startsWith("http://"))) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)));
        } catch (ActivityNotFoundException ignored) {
            // The device has no browser capable of opening the fallback URL.
        }
    }
}
