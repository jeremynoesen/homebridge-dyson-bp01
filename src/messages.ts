/**
 * Information service manufacturer field
 */
export const MANUFACTURER: string = "Dyson";

/**
 * Information service model field
 */
export const MODEL: string = "BP01";

/**
 * Information service serial number field
 */
export const SERIAL_NUMBER: string = "See bottom of machine";

/**
 * Warning to show if serial number is malformed
 */
export const SERIAL_NUMBER_MALFORMED: string = "Serial number malformed, defaulting to placeholder";

/**
 * Warning to show if MAC address is malformed
 */
export const MAC_ADDRESS_MALFORMED: string = "MAC address malformed, ignoring value";

/**
 * Warning to show if expose sensors is not set to 'true' or 'false'
 */
export const EXPOSE_SENSORS_MALFORMED: string = "Expose sensors neither 'true' nor 'false', defaulting to 'false'";

/**
 * Message shown when identifying starts
 */
export const IDENTIFYING: string = "Identifying Dyson BP01 and %s...";

/**
 * Message shown when identifying completes
 */
export const IDENTIFIED: string = "Identified Dyson BP01 and %s";

/**
 * Message shown when searching for BroadLink RMs
 */
export const DEVICE_SEARCHING: string = "Searching for BroadLink RMs...";

/**
 * Message shown when BroadLink RM is discovered
 */
export const DEVICE_DISCOVERED: string = "Discovered %s at %s";

/**
 * Message shown when BroadLink RM is set to be used
 */
export const DEVICE_USING: string = "Using %s at %s";

/**
 * Message shown when connection to BroadLink RM is lost
 */
export const DEVICE_CONNECTION_LOST: string = "Connection to %s lost";

/**
 * Message shown when not connected to BroadLink RM
 */
export const DEVICE_NOT_CONNECTED: string = "Not connected to %s";

/**
 * Message shown when reconnecting to BroadLink RM
 */
export const DEVICE_RECONNECTING: string = "Reconnecting to %s...";

/**
 * Message shown when reconnected to BroadLink RM
 */
export const DEVICE_RECONNECTED: string = "Reconnected to %s";

/**
 * Message shown when initializing target active
 */
export const INIT_TARGET_ACTIVE: string = "Initialized target active to %s";

/**
 * Message shown when initializing current active
 */
export const INIT_CURRENT_ACTIVE: string = "Initialized current active to %s";

/**
 * Message shown when initializing target rotation speed
 */
export const INIT_TARGET_ROTATION_SPEED: string = "Initialized target rotation speed to %s%";

/**
 * Message shown when initializing current rotation speed
 */
export const INIT_CURRENT_ROTATION_SPEED: string = "Initialized current rotation speed to %s%";

/**
 * Message shown when initializing target swing mode
 */
export const INIT_TARGET_SWING_MODE: string = "Initialized target swing mode to %s";

/**
 * Message shown when initializing current swing mode
 */
export const INIT_CURRENT_SWING_MODE: string = "Initialized current swing mode to %s";

/**
 * Message shown when target active is set
 */
export const SET_TARGET_ACTIVE: string = "Set target active to %s";

/**
 * Message shown when target rotation speed is set
 */
export const SET_TARGET_ROTATION_SPEED: string = "Set target rotation speed to %s%";

/**
 * Message shown when target swing mode is set
 */
export const SET_TARGET_SWING_MODE: string = "Set target swing mode to %s";

/**
 * Message shown when setting current temperature
 */
export const SET_CURRENT_TEMPERATURE: string = "Set current temperature to %s˚C";

/**
 * Message shown when setting current relative humidity
 */
export const SET_CURRENT_RELATIVE_HUMIDITY: string = "Set current relative humidity to %s%";

/**
 * Message shown when current active is updated
 */
export const UPDATED_CURRENT_ACTIVE: string = "Updated current active to %s";

/**
 * Message shown when current rotation speed is updated
 */
export const UPDATED_CURRENT_ROTATION_SPEED: string = "Updated current rotation speed to %s%";

/**
 * Message shown when current swing mode is updated
 */
export const UPDATED_CURRENT_SWING_MODE: string = "Updated current swing mode to %s";

/**
 * Message shown when target rotation speed is set to 0%
 */
export const CLAMPED_TARGET_ROTATION_SPEED: string = "Clamped target rotation speed to 10%";