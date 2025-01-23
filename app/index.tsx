import React from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Switch,
  TouchableHighlight,
  AppState,
  Platform,
} from "react-native";
import { Button, Icon } from "react-native-elements";
import BackgroundGeolocation, {
  Location,
  State,
  MotionActivityEvent,
} from "../react-native-background-geolocation";
import BackgroundFetch from "react-native-background-fetch";
import SettingsService from "./lib/SettingsService";
import FABMenu from "./FABMenu";
import TSMapView from "./TSMapView";
import ENV from "../ENV";
import { COLORS, SOUNDS } from "./lib/config";
import { registerTransistorAuthorizationListener } from "../lib/Authorization";

export default function Index({ route, navigation }) {
  const { org, username } = route.params;

  const [enabled, setEnabled] = React.useState(false);
  const [isMoving, setIsMoving] = React.useState(false);
  const [location, setLocation] = React.useState<Location | null>(null);
  const [odometer, setOdometer] = React.useState(0);
  const [motionActivityEvent, setMotionActivityEvent] =
    React.useState<MotionActivityEvent | null>(null);
  const [testClicks, setTestClicks] = React.useState(0);
  const [clickBufferTimeout, setClickBufferTimeout] = React.useState<any>(0);

  // Handy Util class for managing app/plugin Settings.
  const settingsService = SettingsService.getInstance();

  // Init BackgroundGeolocation when view renders.
  React.useEffect(() => {
    const initialize = async () => {
      try {
        // Register event listeners
        const locationSubscriber = BackgroundGeolocation.onLocation(
          setLocation,
          (error) => console.error("[onLocation] ERROR: ", error)
        );

        const motionChangeSubscriber = BackgroundGeolocation.onMotionChange(
          (location) => setIsMoving(location.isMoving)
        );

        const activityChangeSubscriber = BackgroundGeolocation.onActivityChange(
          setMotionActivityEvent
        );

        const notificationActionSubscriber =
          BackgroundGeolocation.onNotificationAction((button) =>
            console.log("[onNotificationAction]", button)
          );

        const heartbeatSubscriber = BackgroundGeolocation.onHeartbeat(
          async (event) => {
            const taskId = await BackgroundGeolocation.startBackgroundTask();
            try {
              const location = await BackgroundGeolocation.getCurrentPosition({
                samples: 2,
                timeout: 10,
                extras: { event: "heartbeat" },
              });
              console.log("[heartbeat] getCurrentPosition", location);
            } catch (error) {
              console.log("[getCurrentPosition] ERROR: ", error);
            }
            BackgroundGeolocation.stopBackgroundTask(taskId);
          }
        );

        // Configure BackgroundGeolocation and fetch state
        await initBackgroundGeolocation();
      } catch (error) {
        console.error("Error initializing BackgroundGeolocation:", error);
      }

      // Clean up event listeners on unmount
      return () => {
        locationSubscriber.remove();
        motionChangeSubscriber.remove();
        activityChangeSubscriber.remove();
        notificationActionSubscriber.remove();
        heartbeatSubscriber.remove();
      };
    };

    initialize();
  }, []);

  // Update state when location changes
  React.useEffect(() => {
    if (location) {
      setOdometer(location.odometer);
    }
  }, [location]);

  // Update app state
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Switch onValueChange={onClickEnable} value={enabled} />
      ),
    });
  }, [enabled]);

  // Handles test-mode clicks on bottom toolbar
  React.useEffect(() => {
    if (testClicks === 0) return;
    settingsService.playSound("TEST_MODE_CLICK");

    if (testClicks >= 10) {
      setTestClicks(0);
      settingsService.playSound("TEST_MODE_SUCCESS");
      settingsService.applyTestConfig();
    } else {
      if (clickBufferTimeout > 0) clearTimeout(clickBufferTimeout);
      setClickBufferTimeout(setTimeout(() => setTestClicks(0), 2000));
    }
  }, [testClicks]);

  // AppState change handler
  const _handleAppStateChange = (nextAppState) => {
    console.log("[_handleAppStateChange]", nextAppState);
    if (nextAppState === "background") {
      // Handle app going into background
    }
  };

  // Configure BackgroundGeolocation.ready
  const initBackgroundGeolocation = async () => {
    const token =
      await BackgroundGeolocation.findOrCreateTransistorAuthorizationToken(
        org,
        username,
        ENV.TRACKER_HOST
      );

    const state: State = await BackgroundGeolocation.ready({
      reset: false,
      debug: true,
      logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
      transistorAuthorizationToken: token,
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_NAVIGATION,
      distanceFilter: 10,
      stopTimeout: 5,
      locationAuthorizationRequest: "Always",
      backgroundPermissionRationale: {
        title:
          "Allow {applicationName} to access your location even when in the background.",
        message: "This app collects location data to track your trips.",
        positiveAction: 'Change to "Always"',
        negativeAction: "Cancel",
      },
      autoSync: true,
      maxDaysToPersist: 14,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
    });

    setOdometer(state.odometer);
    setEnabled(state.enabled);
    setIsMoving(state.isMoving || false);
  };

  // Get current location using BackgroundGeolocation
  const onClickGetCurrentPosition = () => {
    settingsService.playSound("BUTTON_CLICK");

    BackgroundGeolocation.getCurrentPosition({
      persist: true,
      samples: 2,
      timeout: 30,
      maximumAge: 10000,
      extras: { getCurrentPosition: true },
    })
      .then((location) => {
        console.log("[getCurrentPosition] success: ", location);
      })
      .catch((error) => {
        console.warn("[getCurrentPosition] error: ", error);
      });
  };

  // Toggle tracking on/off
  const onClickEnable = async (value: boolean) => {
    let state = await BackgroundGeolocation.getState();
    setEnabled(value);
    if (value) {
      if (state.trackingMode === 1) {
        BackgroundGeolocation.start();
      } else {
        BackgroundGeolocation.startGeofences();
      }
    } else {
      BackgroundGeolocation.stop();
      setIsMoving(false); // Stop tracking when disabled
    }
  };

  // Toggle moving state (start/stop motion tracking)
  const onClickChangePace = () => {
    BackgroundGeolocation.changePace(!isMoving);
    setIsMoving(!isMoving);
  };

  return (
    <SafeAreaView style={styles.container}>
      <TSMapView style={styles.map} navigation={navigation} />
      <View style={styles.toolbar}>
        <View style={styles.leftButton}>
          <Button
            type="clear"
            onPress={onClickGetCurrentPosition}
            containerStyle={{ width: 60 }}
            icon={<Icon name="navigate-sharp" type="ionicon" />}
          />
        </View>
        <View style={styles.centerContent}>
          <TouchableHighlight
            onPress={() => setTestClicks(testClicks + 1)}
            underlayColor="transparent"
          >
            <View style={styles.statusContainer}>
              <Text style={styles.statusBar}>
                {motionActivityEvent ? motionActivityEvent.activity : "unknown"}
              </Text>
              <Text style={styles.separator}>•</Text>
              <Text style={styles.statusBar}>
                {(odometer / 1000).toFixed(1)} km
              </Text>
            </View>
          </TouchableHighlight>
        </View>
        <View style={styles.rightButton}>
          <Button
            containerStyle={{ width: 60 }}
            buttonStyle={{
              backgroundColor: isMoving ? COLORS.red : COLORS.green,
            }}
            onPress={onClickChangePace}
            icon={
              <Icon
                name={isMoving ? "pause-sharp" : "play-sharp"}
                type="ionicon"
                color={COLORS.white}
              />
            }
          />
        </View>
      </View>

      <FABMenu
        navigation={navigation}
        onResetOdometer={(location) => setOdometer(location.odometer)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.gold,
    flex: 1,
    flexDirection: "column",
  },
  map: {
    flex: 1,
  },
  toolbar: {
    backgroundColor: COLORS.gold,
    height: 56,
    flexDirection: "row",
  },
  leftButton: {
    justifyContent: "center",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
  },
  statusContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  statusBar: {
    fontSize: 16,
    color: "#000",
  },
  separator: {
    color: "#000",
  },
  rightButton: {
    justifyContent: "center",
    padding: 5,
  },
});
