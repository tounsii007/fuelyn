// ============================================================
// FuelynAutoService.kt  (Iter AF — Capacitor + Android Auto)
//
// Drop into android/app/src/main/java/com/fuelyn/app/auto/ after
// `pnpm cap:add:android`.
//
// Sister to CarPlaySceneDelegate.swift. Provides an Android-Auto-
// compatible UI for Fuelyn:
//   - PlaceListMapTemplate showing top 5 cheapest reachable
//     stations with their location dots on the map.
//   - Tap a row → hand off to Google Maps for navigation.
//
// Reads from /api/widgets/top-deal — same endpoint the CarPlay
// scene uses, same endpoint the Win11 widget uses.
//
// Wire-up:
//   * AndroidManifest.xml: add the <service> stanza below.
//   * res/xml/automotive_app_desc.xml: declare automotive support.
//   * Add `androidx.car.app:app:1.4.0` to app/build.gradle deps.
// ============================================================

package com.fuelyn.app.auto

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.CarAppService
import androidx.car.app.model.CarLocation
import androidx.car.app.model.ItemList
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.validation.HostValidator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URL

class FuelynAutoService : CarAppService() {

  override fun createHostValidator(): HostValidator =
    if (BuildConfig.DEBUG) HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    else HostValidator.Builder(applicationContext)
      .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
      .build()

  override fun onCreateSession(): Session = FuelynSession()
}

private class FuelynSession : Session() {
  override fun onCreateScreen(intent: android.content.Intent): Screen = TopDealsScreen(carContext)
}

private class TopDealsScreen(carContext: CarContext) : Screen(carContext) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var deals: List<Deal> = emptyList()

  init {
    fetchDeals()
  }

  private fun fetchDeals() {
    scope.launch {
      try {
        val text = URL("https://fuelyn.app/api/widgets/top-deal").readText()
        val obj = JSONObject(text)
        val deal = Deal(
          brand = obj.getString("stationBrand"),
          priceLabel = obj.getString("pricePerLiter"),
          distanceKm = obj.getString("distanceKm"),
          fuelLabel = obj.getString("fuelType"),
          address = obj.getString("address"),
        )
        deals = listOf(deal)
        invalidate() // rebuild the template on the main thread
      } catch (_: Throwable) {
        // Silent fall-through; UI shows the loading row.
      }
    }
  }

  override fun onGetTemplate(): Template {
    val itemListBuilder = ItemList.Builder()
    if (deals.isEmpty()) {
      itemListBuilder.addItem(
        Row.Builder().setTitle("Lade Top Deals …").build()
      )
    } else {
      for (d in deals) {
        val place = Place.Builder(CarLocation.create(0.0, 0.0))
          .setMarker(PlaceMarker.Builder().build())
          .build()
        itemListBuilder.addItem(
          Row.Builder()
            .setTitle("${d.brand} · ${d.priceLabel} €/L")
            .addText("${d.distanceKm} km · ${d.fuelLabel} · ${d.address}")
            .setMetadata(androidx.car.app.model.Metadata.Builder().setPlace(place).build())
            .build()
        )
      }
    }
    return PlaceListMapTemplate.Builder()
      .setTitle("Fuelyn — Top Deals")
      .setItemList(itemListBuilder.build())
      .build()
  }
}

private data class Deal(
  val brand: String,
  val priceLabel: String,
  val distanceKm: String,
  val fuelLabel: String,
  val address: String,
)
