// ============================================================
// TankPilot — Vehicle Model Database
// Popular car models in Germany with typical consumption data.
// ============================================================

import type { FuelType, DriveType } from './types';

export interface VehicleModel {
  readonly brand: string;
  readonly model: string;
  /** Display label: "Brand Model" */
  readonly label: string;
  /** Typical fuel type */
  readonly defaultFuelType: FuelType;
  /** Drive type: benzin, diesel, hybrid, or elektro */
  readonly defaultDriveType: DriveType;
  /** Typical consumption in L/100km (or kWh/100km for electric) */
  readonly typicalConsumption: number;
  /** Typical tank capacity in liters (0 for pure electric) */
  readonly typicalTankCapacity: number;
  /** Battery capacity in kWh (for hybrid/electric, null for combustion) */
  readonly typicalBatteryCapacity: number | null;
}

export const VEHICLE_MODELS: readonly VehicleModel[] = [
  // ─── Volkswagen ──────────────────────────────────
  { brand: 'Volkswagen', model: 'Golf 8', label: 'Volkswagen Golf 8', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Golf 7', label: 'Volkswagen Golf 7', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.2, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Golf GTI', label: 'Volkswagen Golf GTI', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 7.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Polo', label: 'Volkswagen Polo', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Tiguan', label: 'Volkswagen Tiguan', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 58, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'T-Roc', label: 'Volkswagen T-Roc', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.3, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Passat', label: 'Volkswagen Passat', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 66, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Touran', label: 'Volkswagen Touran', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 60, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'T-Cross', label: 'Volkswagen T-Cross', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Arteon', label: 'Volkswagen Arteon', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 66, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Up!', label: 'Volkswagen Up!', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.5, typicalTankCapacity: 35, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Caddy', label: 'Volkswagen Caddy', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.2, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Multivan', label: 'Volkswagen Multivan', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 8.0, typicalTankCapacity: 70, typicalBatteryCapacity: null },

  // ─── BMW ─────────────────────────────────────────
  { brand: 'BMW', model: '1er (F40)', label: 'BMW 1er', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.5, typicalTankCapacity: 42, typicalBatteryCapacity: null },
  { brand: 'BMW', model: '2er Gran Coupé', label: 'BMW 2er Gran Coupé', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.3, typicalTankCapacity: 42, typicalBatteryCapacity: null },
  { brand: 'BMW', model: '3er (G20)', label: 'BMW 3er', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 59, typicalBatteryCapacity: null },
  { brand: 'BMW', model: '4er Gran Coupé', label: 'BMW 4er Gran Coupé', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 59, typicalBatteryCapacity: null },
  { brand: 'BMW', model: '5er (G60)', label: 'BMW 5er', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.9, typicalTankCapacity: 65, typicalBatteryCapacity: null },
  { brand: 'BMW', model: 'X1', label: 'BMW X1', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 51, typicalBatteryCapacity: null },
  { brand: 'BMW', model: 'X3', label: 'BMW X3', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 65, typicalBatteryCapacity: null },
  { brand: 'BMW', model: 'X5', label: 'BMW X5', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 7.5, typicalTankCapacity: 80, typicalBatteryCapacity: null },
  { brand: 'BMW', model: 'M3', label: 'BMW M3', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 10.0, typicalTankCapacity: 59, typicalBatteryCapacity: null },
  { brand: 'BMW', model: 'M4', label: 'BMW M4', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 10.2, typicalTankCapacity: 59, typicalBatteryCapacity: null },

  // ─── Mercedes-Benz ───────────────────────────────
  { brand: 'Mercedes-Benz', model: 'A-Klasse', label: 'Mercedes A-Klasse', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.2, typicalTankCapacity: 43, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'B-Klasse', label: 'Mercedes B-Klasse', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 43, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'C-Klasse (W206)', label: 'Mercedes C-Klasse', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 66, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'E-Klasse (W214)', label: 'Mercedes E-Klasse', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 66, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'GLA', label: 'Mercedes GLA', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 43, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'GLB', label: 'Mercedes GLB', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 43, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'GLC', label: 'Mercedes GLC', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 62, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'GLE', label: 'Mercedes GLE', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 7.5, typicalTankCapacity: 85, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'CLA', label: 'Mercedes CLA', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.3, typicalTankCapacity: 43, typicalBatteryCapacity: null },
  { brand: 'Mercedes-Benz', model: 'V-Klasse', label: 'Mercedes V-Klasse', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 7.5, typicalTankCapacity: 70, typicalBatteryCapacity: null },

  // ─── Audi ────────────────────────────────────────
  { brand: 'Audi', model: 'A1', label: 'Audi A1', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'A3 Sportback', label: 'Audi A3 Sportback', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'A4 Avant', label: 'Audi A4 Avant', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 58, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'A5 Sportback', label: 'Audi A5 Sportback', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 58, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'A6 Avant', label: 'Audi A6 Avant', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 73, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'Q2', label: 'Audi Q2', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'Q3', label: 'Audi Q3', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.2, typicalTankCapacity: 60, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'Q5', label: 'Audi Q5', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 65, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'Q7', label: 'Audi Q7', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 7.5, typicalTankCapacity: 85, typicalBatteryCapacity: null },
  { brand: 'Audi', model: 'RS3', label: 'Audi RS3', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 9.5, typicalTankCapacity: 55, typicalBatteryCapacity: null },

  // ─── Opel ────────────────────────────────────────
  { brand: 'Opel', model: 'Corsa F', label: 'Opel Corsa', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Opel', model: 'Astra L', label: 'Opel Astra', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 52, typicalBatteryCapacity: null },
  { brand: 'Opel', model: 'Mokka', label: 'Opel Mokka', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.3, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Opel', model: 'Crossland', label: 'Opel Crossland', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Opel', model: 'Grandland', label: 'Opel Grandland', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 53, typicalBatteryCapacity: null },
  { brand: 'Opel', model: 'Insignia', label: 'Opel Insignia', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 62, typicalBatteryCapacity: null },

  // ─── Ford ────────────────────────────────────────
  { brand: 'Ford', model: 'Fiesta', label: 'Ford Fiesta', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 42, typicalBatteryCapacity: null },
  { brand: 'Ford', model: 'Focus', label: 'Ford Focus', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 52, typicalBatteryCapacity: null },
  { brand: 'Ford', model: 'Puma', label: 'Ford Puma', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 42, typicalBatteryCapacity: null },
  { brand: 'Ford', model: 'Kuga', label: 'Ford Kuga', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 54, typicalBatteryCapacity: null },

  // ─── Skoda ───────────────────────────────────────
  { brand: 'Skoda', model: 'Fabia', label: 'Skoda Fabia', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.2, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Octavia', label: 'Skoda Octavia', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Octavia Combi', label: 'Skoda Octavia Combi', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.6, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Superb', label: 'Skoda Superb', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 66, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Karoq', label: 'Skoda Karoq', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Kodiaq', label: 'Skoda Kodiaq', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 60, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Kamiq', label: 'Skoda Kamiq', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Scala', label: 'Skoda Scala', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },

  // ─── Hyundai ─────────────────────────────────────
  { brand: 'Hyundai', model: 'i10', label: 'Hyundai i10', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.8, typicalTankCapacity: 32, typicalBatteryCapacity: null },
  { brand: 'Hyundai', model: 'i20', label: 'Hyundai i20', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Hyundai', model: 'i30', label: 'Hyundai i30', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Hyundai', model: 'Tucson', label: 'Hyundai Tucson', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 54, typicalBatteryCapacity: null },
  { brand: 'Hyundai', model: 'Kona', label: 'Hyundai Kona', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 45, typicalBatteryCapacity: null },
  { brand: 'Hyundai', model: 'Bayon', label: 'Hyundai Bayon', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },

  // ─── Kia ─────────────────────────────────────────
  { brand: 'Kia', model: 'Picanto', label: 'Kia Picanto', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.8, typicalTankCapacity: 35, typicalBatteryCapacity: null },
  { brand: 'Kia', model: 'Rio', label: 'Kia Rio', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 45, typicalBatteryCapacity: null },
  { brand: 'Kia', model: 'Ceed', label: 'Kia Ceed', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Kia', model: 'Sportage', label: 'Kia Sportage', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.5, typicalTankCapacity: 54, typicalBatteryCapacity: null },
  { brand: 'Kia', model: 'XCeed', label: 'Kia XCeed', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.2, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Kia', model: 'Sorento', label: 'Kia Sorento', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 7.0, typicalTankCapacity: 67, typicalBatteryCapacity: null },

  // ─── Toyota ──────────────────────────────────────
  { brand: 'Toyota', model: 'Yaris', label: 'Toyota Yaris', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.5, typicalTankCapacity: 36, typicalBatteryCapacity: null },
  { brand: 'Toyota', model: 'Corolla', label: 'Toyota Corolla', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Toyota', model: 'C-HR', label: 'Toyota C-HR', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 43, typicalBatteryCapacity: null },
  { brand: 'Toyota', model: 'RAV4', label: 'Toyota RAV4', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.5, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Toyota', model: 'Aygo X', label: 'Toyota Aygo X', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.5, typicalTankCapacity: 35, typicalBatteryCapacity: null },
  { brand: 'Toyota', model: 'Supra', label: 'Toyota Supra', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 8.5, typicalTankCapacity: 52, typicalBatteryCapacity: null },

  // ─── Seat / Cupra ────────────────────────────────
  { brand: 'Seat', model: 'Ibiza', label: 'Seat Ibiza', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Seat', model: 'Leon', label: 'Seat Leon', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Seat', model: 'Arona', label: 'Seat Arona', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Seat', model: 'Ateca', label: 'Seat Ateca', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Cupra', model: 'Formentor', label: 'Cupra Formentor', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 7.0, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Cupra', model: 'Leon', label: 'Cupra Leon', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 7.2, typicalTankCapacity: 50, typicalBatteryCapacity: null },

  // ─── Renault ─────────────────────────────────────
  { brand: 'Renault', model: 'Clio', label: 'Renault Clio', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 42, typicalBatteryCapacity: null },
  { brand: 'Renault', model: 'Captur', label: 'Renault Captur', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 42, typicalBatteryCapacity: null },
  { brand: 'Renault', model: 'Mégane', label: 'Renault Mégane', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Renault', model: 'Kadjar', label: 'Renault Kadjar', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Renault', model: 'Austral', label: 'Renault Austral', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.3, typicalTankCapacity: 55, typicalBatteryCapacity: null },

  // ─── Peugeot ─────────────────────────────────────
  { brand: 'Peugeot', model: '208', label: 'Peugeot 208', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.2, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Peugeot', model: '308', label: 'Peugeot 308', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 53, typicalBatteryCapacity: null },
  { brand: 'Peugeot', model: '2008', label: 'Peugeot 2008', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Peugeot', model: '3008', label: 'Peugeot 3008', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 53, typicalBatteryCapacity: null },
  { brand: 'Peugeot', model: '5008', label: 'Peugeot 5008', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.2, typicalTankCapacity: 56, typicalBatteryCapacity: null },

  // ─── Fiat ────────────────────────────────────────
  { brand: 'Fiat', model: '500', label: 'Fiat 500', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.0, typicalTankCapacity: 35, typicalBatteryCapacity: null },
  { brand: 'Fiat', model: 'Panda', label: 'Fiat Panda', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.2, typicalTankCapacity: 37, typicalBatteryCapacity: null },
  { brand: 'Fiat', model: 'Tipo', label: 'Fiat Tipo', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 45, typicalBatteryCapacity: null },

  // ─── Mazda ───────────────────────────────────────
  { brand: 'Mazda', model: 'Mazda2', label: 'Mazda 2', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.2, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Mazda', model: 'Mazda3', label: 'Mazda 3', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 51, typicalBatteryCapacity: null },
  { brand: 'Mazda', model: 'CX-5', label: 'Mazda CX-5', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.2, typicalTankCapacity: 56, typicalBatteryCapacity: null },
  { brand: 'Mazda', model: 'CX-30', label: 'Mazda CX-30', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 51, typicalBatteryCapacity: null },
  { brand: 'Mazda', model: 'MX-5', label: 'Mazda MX-5', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 7.0, typicalTankCapacity: 45, typicalBatteryCapacity: null },

  // ─── Volvo ───────────────────────────────────────
  { brand: 'Volvo', model: 'XC40', label: 'Volvo XC40', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.2, typicalTankCapacity: 54, typicalBatteryCapacity: null },
  { brand: 'Volvo', model: 'XC60', label: 'Volvo XC60', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.8, typicalTankCapacity: 71, typicalBatteryCapacity: null },
  { brand: 'Volvo', model: 'XC90', label: 'Volvo XC90', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 7.5, typicalTankCapacity: 71, typicalBatteryCapacity: null },
  { brand: 'Volvo', model: 'V60', label: 'Volvo V60', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 60, typicalBatteryCapacity: null },
  { brand: 'Volvo', model: 'S60', label: 'Volvo S60', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 60, typicalBatteryCapacity: null },

  // ─── Mini ────────────────────────────────────────
  { brand: 'Mini', model: 'Cooper', label: 'Mini Cooper', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 36, typicalBatteryCapacity: null },
  { brand: 'Mini', model: 'Cooper S', label: 'Mini Cooper S', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 6.5, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Mini', model: 'Countryman', label: 'Mini Countryman', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 51, typicalBatteryCapacity: null },

  // ─── Porsche ─────────────────────────────────────
  { brand: 'Porsche', model: 'Cayenne', label: 'Porsche Cayenne', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 10.5, typicalTankCapacity: 90, typicalBatteryCapacity: null },
  { brand: 'Porsche', model: 'Macan', label: 'Porsche Macan', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 9.0, typicalTankCapacity: 65, typicalBatteryCapacity: null },
  { brand: 'Porsche', model: '911', label: 'Porsche 911', defaultFuelType: 'e5', defaultDriveType: 'benzin', typicalConsumption: 10.0, typicalTankCapacity: 64, typicalBatteryCapacity: null },

  // ─── Dacia ───────────────────────────────────────
  { brand: 'Dacia', model: 'Sandero', label: 'Dacia Sandero', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.2, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Dacia', model: 'Duster', label: 'Dacia Duster', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Dacia', model: 'Jogger', label: 'Dacia Jogger', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 50, typicalBatteryCapacity: null },

  // ─── Citroën ─────────────────────────────────────
  { brand: 'Citroën', model: 'C3', label: 'Citroën C3', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.2, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Citroën', model: 'C3 Aircross', label: 'Citroën C3 Aircross', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.8, typicalTankCapacity: 44, typicalBatteryCapacity: null },
  { brand: 'Citroën', model: 'C4', label: 'Citroën C4', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Citroën', model: 'C5 Aircross', label: 'Citroën C5 Aircross', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 6.0, typicalTankCapacity: 53, typicalBatteryCapacity: null },
  { brand: 'Citroën', model: 'Berlingo', label: 'Citroën Berlingo', defaultFuelType: 'diesel', defaultDriveType: 'diesel', typicalConsumption: 5.8, typicalTankCapacity: 50, typicalBatteryCapacity: null },

  // ─── Nissan ──────────────────────────────────────
  { brand: 'Nissan', model: 'Micra', label: 'Nissan Micra', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.0, typicalTankCapacity: 41, typicalBatteryCapacity: null },
  { brand: 'Nissan', model: 'Qashqai', label: 'Nissan Qashqai', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.5, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Nissan', model: 'X-Trail', label: 'Nissan X-Trail', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.8, typicalTankCapacity: 55, typicalBatteryCapacity: null },
  { brand: 'Nissan', model: 'Juke', label: 'Nissan Juke', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 46, typicalBatteryCapacity: null },

  // ─── Honda ───────────────────────────────────────
  { brand: 'Honda', model: 'Civic', label: 'Honda Civic', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 46, typicalBatteryCapacity: null },
  { brand: 'Honda', model: 'HR-V', label: 'Honda HR-V', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Honda', model: 'CR-V', label: 'Honda CR-V', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 7.0, typicalTankCapacity: 57, typicalBatteryCapacity: null },
  { brand: 'Honda', model: 'Jazz', label: 'Honda Jazz', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.5, typicalTankCapacity: 40, typicalBatteryCapacity: null },

  // ─── Suzuki ──────────────────────────────────────
  { brand: 'Suzuki', model: 'Swift', label: 'Suzuki Swift', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 5.0, typicalTankCapacity: 37, typicalBatteryCapacity: null },
  { brand: 'Suzuki', model: 'Vitara', label: 'Suzuki Vitara', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 47, typicalBatteryCapacity: null },
  { brand: 'Suzuki', model: 'Jimny', label: 'Suzuki Jimny', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.8, typicalTankCapacity: 40, typicalBatteryCapacity: null },
  { brand: 'Suzuki', model: 'SX4 S-Cross', label: 'Suzuki SX4 S-Cross', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.0, typicalTankCapacity: 47, typicalBatteryCapacity: null },

  // ─── Mitsubishi ──────────────────────────────────
  { brand: 'Mitsubishi', model: 'Space Star', label: 'Mitsubishi Space Star', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 4.5, typicalTankCapacity: 35, typicalBatteryCapacity: null },
  { brand: 'Mitsubishi', model: 'ASX', label: 'Mitsubishi ASX', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 6.2, typicalTankCapacity: 51, typicalBatteryCapacity: null },
  { brand: 'Mitsubishi', model: 'Outlander', label: 'Mitsubishi Outlander', defaultFuelType: 'e10', defaultDriveType: 'benzin', typicalConsumption: 7.0, typicalTankCapacity: 60, typicalBatteryCapacity: null },

  // ─── Hybrid (PHEV / HEV) ────────────────────────
  { brand: 'Toyota', model: 'Yaris Hybrid', label: 'Toyota Yaris Hybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 3.8, typicalTankCapacity: 36, typicalBatteryCapacity: 0.8 },
  { brand: 'Toyota', model: 'Corolla Hybrid', label: 'Toyota Corolla Hybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 4.5, typicalTankCapacity: 43, typicalBatteryCapacity: 1.3 },
  { brand: 'Toyota', model: 'RAV4 Hybrid', label: 'Toyota RAV4 Hybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 5.6, typicalTankCapacity: 55, typicalBatteryCapacity: 1.6 },
  { brand: 'Toyota', model: 'RAV4 Plug-in Hybrid', label: 'Toyota RAV4 PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.0, typicalTankCapacity: 55, typicalBatteryCapacity: 18.1 },
  { brand: 'Volkswagen', model: 'Golf GTE', label: 'Volkswagen Golf GTE', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.4, typicalTankCapacity: 40, typicalBatteryCapacity: 13.0 },
  { brand: 'Volkswagen', model: 'Tiguan eHybrid', label: 'Volkswagen Tiguan eHybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.7, typicalTankCapacity: 50, typicalBatteryCapacity: 13.0 },
  { brand: 'Volkswagen', model: 'Passat GTE', label: 'Volkswagen Passat GTE', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.6, typicalTankCapacity: 50, typicalBatteryCapacity: 13.0 },
  { brand: 'BMW', model: '330e', label: 'BMW 330e', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.7, typicalTankCapacity: 40, typicalBatteryCapacity: 12.0 },
  { brand: 'BMW', model: 'X1 xDrive25e', label: 'BMW X1 PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.9, typicalTankCapacity: 36, typicalBatteryCapacity: 10.0 },
  { brand: 'BMW', model: 'X3 xDrive30e', label: 'BMW X3 PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 2.0, typicalTankCapacity: 50, typicalBatteryCapacity: 12.0 },
  { brand: 'Mercedes-Benz', model: 'A 250 e', label: 'Mercedes A 250 e', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.4, typicalTankCapacity: 35, typicalBatteryCapacity: 15.6 },
  { brand: 'Mercedes-Benz', model: 'C 300 e', label: 'Mercedes C 300 e', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 0.7, typicalTankCapacity: 50, typicalBatteryCapacity: 25.4 },
  { brand: 'Mercedes-Benz', model: 'GLC 300 e', label: 'Mercedes GLC 300 e', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 0.8, typicalTankCapacity: 50, typicalBatteryCapacity: 31.2 },
  { brand: 'Hyundai', model: 'Tucson Hybrid', label: 'Hyundai Tucson Hybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 5.5, typicalTankCapacity: 54, typicalBatteryCapacity: 1.5 },
  { brand: 'Kia', model: 'Sportage PHEV', label: 'Kia Sportage PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.6, typicalTankCapacity: 54, typicalBatteryCapacity: 13.8 },
  { brand: 'Kia', model: 'Niro HEV', label: 'Kia Niro Hybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 4.4, typicalTankCapacity: 42, typicalBatteryCapacity: 1.3 },
  { brand: 'Kia', model: 'Niro PHEV', label: 'Kia Niro PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.3, typicalTankCapacity: 42, typicalBatteryCapacity: 11.1 },
  { brand: 'Mitsubishi', model: 'Outlander PHEV', label: 'Mitsubishi Outlander PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.8, typicalTankCapacity: 45, typicalBatteryCapacity: 20.0 },
  { brand: 'Volvo', model: 'XC60 Recharge', label: 'Volvo XC60 Recharge PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.8, typicalTankCapacity: 60, typicalBatteryCapacity: 18.8 },
  { brand: 'Volvo', model: 'XC90 Recharge', label: 'Volvo XC90 Recharge PHEV', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 2.1, typicalTankCapacity: 60, typicalBatteryCapacity: 18.8 },
  { brand: 'Cupra', model: 'Formentor e-Hybrid', label: 'Cupra Formentor e-Hybrid', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.5, typicalTankCapacity: 45, typicalBatteryCapacity: 12.8 },
  { brand: 'Audi', model: 'A3 TFSI e', label: 'Audi A3 TFSI e', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.4, typicalTankCapacity: 40, typicalBatteryCapacity: 13.0 },
  { brand: 'Audi', model: 'Q5 TFSI e', label: 'Audi Q5 TFSI e', defaultFuelType: 'e10', defaultDriveType: 'hybrid', typicalConsumption: 1.9, typicalTankCapacity: 55, typicalBatteryCapacity: 17.9 },

  // ─── Elektro (BEV) ──────────────────────────────
  { brand: 'Tesla', model: 'Model 3', label: 'Tesla Model 3', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 14.0, typicalTankCapacity: 0, typicalBatteryCapacity: 60 },
  { brand: 'Tesla', model: 'Model 3 Long Range', label: 'Tesla Model 3 LR', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 14.5, typicalTankCapacity: 0, typicalBatteryCapacity: 82 },
  { brand: 'Tesla', model: 'Model Y', label: 'Tesla Model Y', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 15.5, typicalTankCapacity: 0, typicalBatteryCapacity: 60 },
  { brand: 'Tesla', model: 'Model Y Long Range', label: 'Tesla Model Y LR', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 82 },
  { brand: 'Volkswagen', model: 'ID.3', label: 'Volkswagen ID.3', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 15.4, typicalTankCapacity: 0, typicalBatteryCapacity: 58 },
  { brand: 'Volkswagen', model: 'ID.3 Pro S', label: 'Volkswagen ID.3 Pro S', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Volkswagen', model: 'ID.4', label: 'Volkswagen ID.4', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Volkswagen', model: 'ID.5', label: 'Volkswagen ID.5', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.5, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Volkswagen', model: 'ID.7', label: 'Volkswagen ID.7', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 15.5, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'BMW', model: 'iX1', label: 'BMW iX1', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 65 },
  { brand: 'BMW', model: 'iX3', label: 'BMW iX3', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 18.5, typicalTankCapacity: 0, typicalBatteryCapacity: 80 },
  { brand: 'BMW', model: 'i4', label: 'BMW i4', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 84 },
  { brand: 'BMW', model: 'i5', label: 'BMW i5', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 18.0, typicalTankCapacity: 0, typicalBatteryCapacity: 84 },
  { brand: 'BMW', model: 'iX', label: 'BMW iX', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 20.0, typicalTankCapacity: 0, typicalBatteryCapacity: 105 },
  { brand: 'Mercedes-Benz', model: 'EQA', label: 'Mercedes EQA', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 67 },
  { brand: 'Mercedes-Benz', model: 'EQB', label: 'Mercedes EQB', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 18.0, typicalTankCapacity: 0, typicalBatteryCapacity: 67 },
  { brand: 'Mercedes-Benz', model: 'EQC', label: 'Mercedes EQC', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 21.0, typicalTankCapacity: 0, typicalBatteryCapacity: 80 },
  { brand: 'Mercedes-Benz', model: 'EQE', label: 'Mercedes EQE', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.5, typicalTankCapacity: 0, typicalBatteryCapacity: 91 },
  { brand: 'Mercedes-Benz', model: 'EQS', label: 'Mercedes EQS', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 18.0, typicalTankCapacity: 0, typicalBatteryCapacity: 108 },
  { brand: 'Audi', model: 'Q4 e-tron', label: 'Audi Q4 e-tron', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.5, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Audi', model: 'Q8 e-tron', label: 'Audi Q8 e-tron', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 21.0, typicalTankCapacity: 0, typicalBatteryCapacity: 106 },
  { brand: 'Audi', model: 'e-tron GT', label: 'Audi e-tron GT', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 19.5, typicalTankCapacity: 0, typicalBatteryCapacity: 84 },
  { brand: 'Hyundai', model: 'Ioniq 5', label: 'Hyundai Ioniq 5', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 73 },
  { brand: 'Hyundai', model: 'Ioniq 6', label: 'Hyundai Ioniq 6', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 14.3, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Hyundai', model: 'Kona Electric', label: 'Hyundai Kona Electric', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 15.0, typicalTankCapacity: 0, typicalBatteryCapacity: 65 },
  { brand: 'Kia', model: 'EV6', label: 'Kia EV6', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Kia', model: 'Niro EV', label: 'Kia Niro EV', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 65 },
  { brand: 'Opel', model: 'Corsa-e', label: 'Opel Corsa-e', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 15.5, typicalTankCapacity: 0, typicalBatteryCapacity: 50 },
  { brand: 'Opel', model: 'Mokka-e', label: 'Opel Mokka-e', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 50 },
  { brand: 'Peugeot', model: 'e-208', label: 'Peugeot e-208', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 15.0, typicalTankCapacity: 0, typicalBatteryCapacity: 50 },
  { brand: 'Peugeot', model: 'e-2008', label: 'Peugeot e-2008', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 50 },
  { brand: 'Renault', model: 'Zoe', label: 'Renault Zoe', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.5, typicalTankCapacity: 0, typicalBatteryCapacity: 52 },
  { brand: 'Renault', model: 'Megane E-Tech', label: 'Renault Megane E-Tech', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 60 },
  { brand: 'Fiat', model: '500e', label: 'Fiat 500e', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 14.0, typicalTankCapacity: 0, typicalBatteryCapacity: 42 },
  { brand: 'Mini', model: 'Cooper SE', label: 'Mini Cooper SE', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 33 },
  { brand: 'Porsche', model: 'Taycan', label: 'Porsche Taycan', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 21.0, typicalTankCapacity: 0, typicalBatteryCapacity: 84 },
  { brand: 'Volvo', model: 'EX30', label: 'Volvo EX30', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 69 },
  { brand: 'Volvo', model: 'XC40 Recharge Pure', label: 'Volvo XC40 Recharge BEV', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 18.0, typicalTankCapacity: 0, typicalBatteryCapacity: 78 },
  { brand: 'Cupra', model: 'Born', label: 'Cupra Born', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.0, typicalTankCapacity: 0, typicalBatteryCapacity: 58 },
  { brand: 'Skoda', model: 'Enyaq iV', label: 'Skoda Enyaq iV', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 77 },
  { brand: 'Nissan', model: 'Leaf', label: 'Nissan Leaf', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 40 },
  { brand: 'Nissan', model: 'Ariya', label: 'Nissan Ariya', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 18.0, typicalTankCapacity: 0, typicalBatteryCapacity: 87 },
  { brand: 'Dacia', model: 'Spring', label: 'Dacia Spring', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 14.0, typicalTankCapacity: 0, typicalBatteryCapacity: 27 },
  { brand: 'Smart', model: '#1', label: 'Smart #1', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 17.0, typicalTankCapacity: 0, typicalBatteryCapacity: 66 },
  { brand: 'Smart', model: '#3', label: 'Smart #3', defaultFuelType: 'e10', defaultDriveType: 'elektro', typicalConsumption: 16.5, typicalTankCapacity: 0, typicalBatteryCapacity: 66 },

  // ─── Wasserstoff (H2 / FCEV) ────────────────────
  { brand: 'Toyota', model: 'Mirai', label: 'Toyota Mirai', defaultFuelType: 'e10', defaultDriveType: 'h2', typicalConsumption: 0.76, typicalTankCapacity: 0, typicalBatteryCapacity: null },
  { brand: 'Hyundai', model: 'Nexo', label: 'Hyundai Nexo', defaultFuelType: 'e10', defaultDriveType: 'h2', typicalConsumption: 0.95, typicalTankCapacity: 0, typicalBatteryCapacity: null },
  { brand: 'BMW', model: 'iX5 Hydrogen', label: 'BMW iX5 Hydrogen', defaultFuelType: 'e10', defaultDriveType: 'h2', typicalConsumption: 1.2, typicalTankCapacity: 0, typicalBatteryCapacity: null },

  // ─── Gas (LPG / CNG) ───────────────────────────
  { brand: 'Fiat', model: 'Panda LPG', label: 'Fiat Panda LPG', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 7.5, typicalTankCapacity: 35, typicalBatteryCapacity: null },
  { brand: 'Dacia', model: 'Sandero LPG', label: 'Dacia Sandero LPG', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 7.8, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Dacia', model: 'Duster LPG', label: 'Dacia Duster LPG', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 8.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Dacia', model: 'Jogger LPG', label: 'Dacia Jogger LPG', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 7.8, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Volkswagen', model: 'Caddy TGI', label: 'VW Caddy TGI (CNG)', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 4.4, typicalTankCapacity: 0, typicalBatteryCapacity: null },
  { brand: 'Seat', model: 'Leon TGI', label: 'Seat Leon TGI (CNG)', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 3.8, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Skoda', model: 'Octavia G-Tec', label: 'Skoda Octavia G-Tec (CNG)', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 3.5, typicalTankCapacity: 50, typicalBatteryCapacity: null },
  { brand: 'Fiat', model: '500 Hybrid LPG', label: 'Fiat 500 Hybrid LPG', defaultFuelType: 'e10', defaultDriveType: 'gas', typicalConsumption: 6.8, typicalTankCapacity: 35, typicalBatteryCapacity: null },
] as const;

/**
 * Search vehicle models by query string (fuzzy matching).
 * Matches against brand, model, and label. Returns top N results.
 */
export function searchVehicleModels(
  query: string,
  maxResults = 8,
): VehicleModel[] {
  if (!query || query.length < 1) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = VEHICLE_MODELS
    .map((vm) => {
      const haystack = `${vm.brand} ${vm.model} ${vm.label}`.toLowerCase();
      let score = 0;

      for (const term of terms) {
        if (haystack.includes(term)) {
          score += 1;
          // Bonus for brand match at start
          if (vm.brand.toLowerCase().startsWith(term)) score += 0.5;
          // Bonus for exact model match
          if (vm.model.toLowerCase().startsWith(term)) score += 0.3;
        }
      }

      return { vm, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map((s) => s.vm);
}
