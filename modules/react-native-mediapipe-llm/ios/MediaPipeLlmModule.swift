import ExpoModulesCore
import MediaPipeTasksGenAI

// Wraps Google's MediaPipe LLM Inference (LiteRT-LM) for use as a ChatEngine.
// The session model mirrors what llama.rn exposes: create -> generate (stream
// via events) -> cancel/release. Sessions are addressed by an integer id so the
// JS layer can track multiple loads even though only one is realistic on-device.
//
// API references:
//   https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/ios
//
// NOTE: This file targets the MediaPipeTasksGenAI iOS API as documented for
// MediaPipe Tasks 0.10.x. Streaming, cancellation, and session lifecycle still
// need device validation — see modules/react-native-mediapipe-llm/README.md.

public class MediaPipeLlmModule: Module {
  private var llms: [Int: LlmInference] = [:]
  private var sessions: [Int: LlmInference.Session] = [:]
  private var nextId: Int = 1

  public func definition() -> ModuleDefinition {
    Name("MediaPipeLlm")

    Events("onPartial", "onError")

    AsyncFunction("createSession") { (opts: CreateOptions, promise: Promise) in
      do {
        let llmOptions = LlmInference.Options(modelPath: opts.modelPath)
        if let maxTokens = opts.maxTokens { llmOptions.maxTokens = maxTokens }
        let llm = try LlmInference(options: llmOptions)

        let sessionOptions = LlmInference.Session.Options()
        if let topK = opts.topK { sessionOptions.topk = topK }
        if let topP = opts.topP { sessionOptions.topp = topP }
        if let temperature = opts.temperature { sessionOptions.temperature = temperature }
        if let seed = opts.randomSeed { sessionOptions.randomSeed = seed }

        let session = try LlmInference.Session(llmInference: llm, options: sessionOptions)

        let id = self.nextId
        self.nextId += 1
        self.llms[id] = llm
        self.sessions[id] = session
        promise.resolve(id)
      } catch {
        promise.reject("ERR_MEDIAPIPE_LOAD", error.localizedDescription)
      }
    }

    AsyncFunction("generate") { (id: Int, prompt: String, promise: Promise) in
      guard let session = self.sessions[id] else {
        promise.reject("ERR_NO_SESSION", "session \(id) not found")
        return
      }
      do {
        try session.addQueryChunk(inputText: prompt)
        try session.generateResponseAsync(progress: { [weak self] partial, error in
          guard let self = self else { return }
          if let error = error {
            self.sendEvent("onError", ["sessionId": id, "message": error.localizedDescription])
            return
          }
          if let partial = partial {
            self.sendEvent("onPartial", ["sessionId": id, "partial": partial, "done": false])
          }
        }, completion: { [weak self] in
          guard let self = self else { return }
          self.sendEvent("onPartial", ["sessionId": id, "partial": "", "done": true])
        })
        promise.resolve(nil)
      } catch {
        promise.reject("ERR_MEDIAPIPE_GENERATE", error.localizedDescription)
      }
    }

    AsyncFunction("cancel") { (id: Int, promise: Promise) in
      // MediaPipe's iOS SDK does not currently expose a public mid-stream cancel
      // hook on Session; the workaround is to release the session, which aborts
      // any in-flight generation. We reuse the release path here.
      self.disposeSession(id: id)
      promise.resolve(nil)
    }

    AsyncFunction("release") { (id: Int, promise: Promise) in
      self.disposeSession(id: id)
      promise.resolve(nil)
    }

    OnDestroy {
      for id in Array(self.sessions.keys) { self.disposeSession(id: id) }
    }
  }

  private func disposeSession(id: Int) {
    sessions.removeValue(forKey: id)
    llms.removeValue(forKey: id)
  }
}

struct CreateOptions: Record {
  @Field var modelPath: String = ""
  @Field var maxTokens: Int?
  @Field var temperature: Float?
  @Field var topK: Int?
  @Field var topP: Float?
  @Field var randomSeed: Int?
}
