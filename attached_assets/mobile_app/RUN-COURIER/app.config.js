const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  expo: {
    name: "RUN COURIER",
    slug: "run-courier",
    version: "2.70.77",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "runcourier",
    userInterfaceStyle: "automatic",
    updates: {
      url: "https://u.expo.dev/b47c7fde-4d57-42be-bfdf-4d6d73e12f46"
    },
    runtimeVersion: "1.0.0",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.runcourier.driver",
      buildNumber: "60",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Run Courier needs your location to track deliveries and provide navigation to pickup and delivery addresses.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Run Courier needs your location to track deliveries in real-time, even when the app is in the background.",
        NSCameraUsageDescription:
          "Run Courier needs camera access to take proof of delivery photos, scan barcodes, and upload documents.",
        NSPhotoLibraryUsageDescription:
          "Run Courier needs photo library access to select proof of delivery photos and upload driver documents.",
        NSPhotoLibraryAddUsageDescription:
          "Run Courier needs permission to save proof of delivery photos to your photo library.",
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: [
          "comgooglemaps",
          "waze",
        ],
      },
    },
    android: {
      package: "com.runcourier.driver",
      versionCode: 21,
      permissions: [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.CAMERA",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION",
      ],
      adaptiveIcon: {
        backgroundColor: "#ffffff",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#1a1a1a",
          },
        },
      ],
      "expo-web-browser",
      [
        "expo-camera",
        {
          cameraPermission:
            "Run Courier needs camera access to take proof of delivery photos and scan barcodes.",
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Run Courier needs your location to track deliveries in real-time.",
          locationAlwaysPermission:
            "Run Courier needs background location access to track active deliveries.",
          locationWhenInUsePermission:
            "Run Courier needs your location to provide navigation to delivery addresses.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Run Courier needs photo library access to select proof of delivery photos and upload driver documents.",
          cameraPermission:
            "Run Courier needs camera access to take proof of delivery photos and scan barcodes.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#FF6B35",
          sounds: ["./assets/sounds/notification.mp3"],
        },
      ],
      [
        "expo-audio",
        {
          "recordAudioAndroid": false,
          "enableBackgroundRecording": false,
          "enableBackgroundPlayback": false
        }
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "b47c7fde-4d57-42be-bfdf-4d6d73e12f46",
      },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
      stripePublishableKey:
        process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "",
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    },
    owner: "almashriqi",
  },
};
