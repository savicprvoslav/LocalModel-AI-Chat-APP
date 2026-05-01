package expo.modules.mediapipellm

import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

// Wraps Google's MediaPipe LLM Inference (LiteRT-LM) for use as a ChatEngine.
// Mirrors the iOS surface in modules/react-native-mediapipe-llm/ios.
//
// API references:
//   https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/android
//
// NOTE: Streaming, cancellation and lifecycle still need device validation —
// see modules/react-native-mediapipe-llm/README.md.
class MediaPipeLlmModule : Module() {
  private val llms = ConcurrentHashMap<Int, LlmInference>()
  private val sessions = ConcurrentHashMap<Int, LlmInferenceSession>()
  private val nextId = AtomicInteger(1)

  override fun definition() = ModuleDefinition {
    Name("MediaPipeLlm")

    Events("onPartial", "onError")

    AsyncFunction("createSession") { opts: CreateOptions ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")

      val llmOptionsBuilder = LlmInference.LlmInferenceOptions.builder()
        .setModelPath(opts.modelPath)
      opts.maxTokens?.let { llmOptionsBuilder.setMaxTokens(it) }
      val llm = LlmInference.createFromOptions(context, llmOptionsBuilder.build())

      val sessionOptionsBuilder = LlmInferenceSession.LlmInferenceSessionOptions.builder()
      opts.topK?.let { sessionOptionsBuilder.setTopK(it) }
      opts.topP?.let { sessionOptionsBuilder.setTopP(it) }
      opts.temperature?.let { sessionOptionsBuilder.setTemperature(it) }
      opts.randomSeed?.let { sessionOptionsBuilder.setRandomSeed(it) }
      val session = LlmInferenceSession.createFromOptions(llm, sessionOptionsBuilder.build())

      val id = nextId.getAndIncrement()
      llms[id] = llm
      sessions[id] = session
      id
    }

    AsyncFunction("generate") { id: Int, prompt: String ->
      val session = sessions[id] ?: throw IllegalArgumentException("session $id not found")
      session.addQueryChunk(prompt)
      session.generateResponseAsync { partial, done ->
        sendEvent("onPartial", mapOf(
          "sessionId" to id,
          "partial" to (partial ?: ""),
          "done" to done
        ))
      }
    }

    AsyncFunction("cancel") { id: Int ->
      // MediaPipe's Android SDK does not expose mid-stream cancel; releasing the
      // session aborts any in-flight callback. Same approach as iOS.
      dispose(id)
    }

    AsyncFunction("release") { id: Int ->
      dispose(id)
    }

    OnDestroy {
      sessions.keys.toList().forEach { dispose(it) }
    }
  }

  private fun dispose(id: Int) {
    sessions.remove(id)?.close()
    llms.remove(id)?.close()
  }
}

class CreateOptions : Record {
  @Field var modelPath: String = ""
  @Field var maxTokens: Int? = null
  @Field var temperature: Float? = null
  @Field var topK: Int? = null
  @Field var topP: Float? = null
  @Field var randomSeed: Int? = null
}
