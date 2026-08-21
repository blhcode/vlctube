package local.vlctube;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "YtDlp")
public class YtDlpPlugin extends Plugin {
    private static final String TAG = "YtDlp";
    private static volatile boolean initialized = false;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    private void ensureInit() throws Exception {
        if (initialized) return;
        synchronized (YtDlpPlugin.class) {
            if (initialized) return;
            YoutubeDL.getInstance().init(getContext().getApplicationContext());
            initialized = true;
        }
    }

    @PluginMethod
    public void execute(PluginCall call) {
        JSArray raw = call.getArray("args");
        if (raw == null) {
            call.reject("args required");
            return;
        }

        executor.execute(() -> {
            try {
                ensureInit();
                List<String> args = new ArrayList<>();
                for (int i = 0; i < raw.length(); i++) {
                    args.add(raw.getString(i));
                }
                if (args.isEmpty()) {
                    call.reject("empty args");
                    return;
                }

                String url = args.get(args.size() - 1);
                List<String> options = args.subList(0, args.size() - 1);

                YoutubeDLRequest request = new YoutubeDLRequest(url);
                for (int i = 0; i < options.size(); i++) {
                    String opt = options.get(i);
                    if (!opt.startsWith("-")) {
                        continue;
                    }
                    if (i + 1 < options.size() && !options.get(i + 1).startsWith("-")) {
                        request.addOption(opt, options.get(i + 1));
                        i++;
                    } else {
                        request.addOption(opt);
                    }
                }

                YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null, null);
                JSObject ret = new JSObject();
                ret.put("stdout", response.getOut() == null ? "" : response.getOut());
                ret.put("stderr", response.getErr() == null ? "" : response.getErr());
                ret.put("exitCode", response.getExitCode());
                call.resolve(ret);
            } catch (JSONException e) {
                Log.e(TAG, "bad args", e);
                call.reject(e.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "yt-dlp failed", e);
                call.reject(e.getMessage() == null ? "yt-dlp failed" : e.getMessage());
            }
        });
    }
}
