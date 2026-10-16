// AR-04: the App Store download id (appTransactionID, iOS 16+). Apple's
// RESCIND_CONSENT notification names this id, not our user, so the app sends
// it to link_app_transaction. Unverified results are still returned: the id
// is only used to match Apple-signed notifications on the server.
import ExpoModulesCore
import StoreKit

public class AppTransactionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnlySwapAppTransaction")

    AsyncFunction("getAppTransactionIdAsync") { () async -> String? in
      do {
        switch try await AppTransaction.shared {
        case .verified(let transaction):
          return transaction.appTransactionID
        case .unverified(let transaction, _):
          return transaction.appTransactionID
        }
      } catch {
        return nil
      }
    }
  }
}
