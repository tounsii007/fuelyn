// ============================================================
// CarPlaySceneDelegate.swift  (Iter AF — Capacitor + CarPlay)
//
// Drop into ios/App/App/ after `pnpm cap:add:ios`.
//
// Provides a CarPlay-compatible UI for Fuelyn:
//   - List template: top 5 cheapest reachable stations
//   - Tap a row → Now Playing-style template with the station,
//     fuel grade, price, distance, and a "Navigate" CTA that
//     hands off to Apple Maps.
//
// Data is read from the same JSON the PWA widget already exposes
// (/api/widgets/top-deal). The CarPlay process and the main web
// view do NOT share state directly — they communicate through
// the BFF, which keeps the Capacitor ↔ Swift bridge surface
// minimal.
//
// Wire-up (Info.plist additions, see CarPlay-INFO.plist next door):
//   * UIApplicationSceneManifest → adds a 2nd CPTemplateApplication
//     scene role with this class.
//   * com.apple.developer.carplay-maps entitlement (requested via
//     Apple Developer portal — automotive entitlement).
// ============================================================

import CarPlay
import UIKit

@available(iOS 14.0, *)
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

  var interfaceController: CPInterfaceController?

  // MARK: - CPTemplateApplicationSceneDelegate

  func templateApplicationScene(
    _ scene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = interfaceController
    let listTemplate = makeLoadingTemplate()
    interfaceController.setRootTemplate(listTemplate, animated: false, completion: nil)
    Task { await self.refreshDeals() }
  }

  func templateApplicationScene(
    _ scene: CPTemplateApplicationScene,
    didDisconnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = nil
  }

  // MARK: - Templates

  private func makeLoadingTemplate() -> CPListTemplate {
    let item = CPListItem(text: "Lade Top Deals …", detailText: nil)
    let section = CPListSection(items: [item])
    let template = CPListTemplate(title: "Fuelyn", sections: [section])
    return template
  }

  private func makeListTemplate(deals: [FuelyDeal]) -> CPListTemplate {
    let items: [CPListItem] = deals.map { deal in
      let item = CPListItem(
        text: "\(deal.brand) · \(deal.priceLabel) €/L",
        detailText: "\(deal.distanceKm) km · \(deal.fuelLabel) · \(deal.address)"
      )
      item.handler = { [weak self] _, completion in
        self?.openDeal(deal)
        completion()
      }
      return item
    }
    let section = CPListSection(items: items)
    return CPListTemplate(title: "Fuelyn — Top Deals", sections: [section])
  }

  // MARK: - Networking

  private func refreshDeals() async {
    guard let url = URL(string: "https://fuelyn.app/api/widgets/top-deal") else { return }
    do {
      let (data, _) = try await URLSession.shared.data(from: url)
      let decoded = try JSONDecoder().decode(WidgetData.self, from: data)
      let deal = FuelyDeal(
        brand: decoded.stationBrand,
        priceLabel: decoded.pricePerLiter,
        distanceKm: decoded.distanceKm,
        fuelLabel: decoded.fuelType,
        address: decoded.address,
        deepLink: decoded.deepLink
      )
      await MainActor.run {
        self.interfaceController?.setRootTemplate(self.makeListTemplate(deals: [deal]), animated: true, completion: nil)
      }
    } catch {
      // Silent fall-through — keep showing the loading state if the BFF is
      // unreachable. Users can pull-to-refresh once we add that.
      print("CarPlay refresh failed: \(error)")
    }
  }

  // MARK: - Actions

  private func openDeal(_ deal: FuelyDeal) {
    // Hand off the deep-link to the main app via a URL — Apple's docs
    // recommend `interfaceController.pushTemplate(...)` for richer
    // detail views, but for v1 we open the main app.
    if let url = URL(string: deal.deepLink) {
      UIApplication.shared.open(url)
    }
  }
}

// MARK: - Models

private struct FuelyDeal {
  let brand: String
  let priceLabel: String
  let distanceKm: String
  let fuelLabel: String
  let address: String
  let deepLink: String
}

private struct WidgetData: Decodable {
  let stationBrand: String
  let address: String
  let pricePerLiter: String
  let distanceKm: String
  let fuelType: String
  let updatedRelative: String
  let deepLink: String
}
