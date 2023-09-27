/**
 * Information service manufacturer field
 */
export const INFO_MANUFACTURER: string = "Dyson";

/**
 * Information service model field
 */
export const INFO_MODEL: string = "BP01";

/**
 * Information service serial number field
 */
export const INFO_SERIAL_NUMBER: string = "See bottom of machine";

/**
 * Message shown when identifying starts
 */
export const IDENTIFYING: string = "Identifying Dyson BP01 and BroadLink RM...";

/**
 * Message shown when identifying completes
 */
export const IDENTIFIED: string = "Identified Dyson BP01 and BroadLink RM";

/**
 * Message shown when searching for BroadLink RMs
 */
export const DEVICE_DISCOVERING: string = "Discovering BroadLink RMs...";

/**
 * Message shown when BroadLink RM is discovered
 */
export const DEVICE_DISCOVERED: string = "Discovered BroadLink RM at %s";

/**
 * Message shown when BroadLink RM is set to be used
 */
export const DEVICE_USING: string = "Using BroadLink RM at %s";

/**
 * Message shown when connection to BroadLink RM is lost
 */
export const DEVICE_CONNECTION_LOST: string = "Connection to BroadLink RM lost";

/**
 * Message shown when not connected to BroadLink RM
 */
export const DEVICE_NOT_CONNECTED: string = "Not connected to BroadLink RM";

/**
 * Message shown when reconnecting to BroadLink RM
 */
export const DEVICE_RECONNECTING: string = "Reconnecting to BroadLink RM...";

/**
 * Message shown when reconnected to BroadLink RM
 */
export const DEVICE_RECONNECTED: string = "Reconnected to BroadLink RM";

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
 * Message shown when target swing mode is set and current active is 1
 */
export const SET_TARGET_SWING_MODE_ACTIVE: string = "Set target swing mode to %s";

/**
 * Message shown when attempting to set target swing mode when current active is 0
 */
export const SET_TARGET_SWING_MODE_INACTIVE: string = "Unable to set target swing mode when target active is 0";

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