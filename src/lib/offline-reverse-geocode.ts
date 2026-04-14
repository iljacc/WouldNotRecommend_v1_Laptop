import path from "path";
import geocoderRaw from "local-reverse-geocoder";

const geocoder = geocoderRaw as typeof geocoderRaw & {
  _kdTree?: unknown;
  init: (
    options: {
      dumpDirectory?: string;
      citiesFileOverride?: string;
      load?: {
        admin1?: boolean;
        admin2?: boolean;
        admin3And4?: boolean;
        alternateNames?: boolean;
      };
    },
    cb?: () => void,
  ) => void;
  lookUp: (typeof geocoderRaw)["lookUp"];
};

const DUMP_DIRECTORY = path.join(process.cwd(), ".cache", "geonames");

/** Smaller DB = faster first download; enough for typical urban spawns. */
const CITIES_FILE = "cities1000" as const;

const INIT_TIMEOUT_MS = 180_000;

let initPromise: Promise<void> | null = null;

async function loadGeocoderInternal(): Promise<void> {
  try {
    geocoder.init(
      {
        dumpDirectory: DUMP_DIRECTORY,
        citiesFileOverride: CITIES_FILE,
        load: {
          admin1: true,
          admin2: false,
          admin3And4: false,
          alternateNames: false,
        },
      },
      () => {
        /* library success callback */
      },
    );
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  const deadline = Date.now() + INIT_TIMEOUT_MS;
  while (!geocoder._kdTree && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!geocoder._kdTree) {
    throw new Error(
      "GeoNames data did not load into memory within " +
        INIT_TIMEOUT_MS / 1000 +
        "s. The first server start downloads files into .cache/geonames (tens of MB). Check network, disk space, and the terminal running `next dev` for download/unzip errors.",
    );
  }
}

function ensureGeocoderLoaded(): Promise<void> {
  if (!initPromise) {
    initPromise = loadGeocoderInternal().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export type OfflineGeocodeHit = {
  city: string;
  country: string;
  countryCode: string;
};

export async function lookupCityCountryOffline(
  lat: number,
  lng: number,
): Promise<OfflineGeocodeHit | null> {
  await ensureGeocoderLoaded();

  return new Promise((resolve, reject) => {
    try {
      geocoder.lookUp({ latitude: lat, longitude: lng }, 1, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        const row = res?.[0];
        const hit = Array.isArray(row) ? row[0] : row;
        if (!hit || typeof hit !== "object") {
          resolve(null);
          return;
        }

        const rec = hit as {
          name?: string;
          asciiName?: string;
          countryCode?: string;
        };
        const city = (rec.name || rec.asciiName || "").trim();
        const code = (rec.countryCode || "").trim();
        if (!city || !code) {
          resolve(null);
          return;
        }

        let country: string;
        try {
          country = regionNames.of(code) || code;
        } catch {
          country = code;
        }

        resolve({ city, country, countryCode: code });
      });
    } catch (e) {
      reject(e);
    }
  });
}
