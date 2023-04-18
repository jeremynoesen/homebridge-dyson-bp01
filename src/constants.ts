/**
 * Interval in milliseconds
 */
export const INTERVAL: number = 750;

/**
 * Number of active skips after updating current active to active
 */
export const SKIPS_UPDATE_CURRENT_ACTIVE_ACTIVE: number = 2;

/**
 * Number of active skips after updating current active to inactive
 */
export const SKIPS_UPDATE_CURRENT_ACTIVE_INACTIVE: number = 8;

/**
 * Number of swing mode skips after updating current swing mode
 */
export const SKIPS_UPDATE_CURRENT_SWING_MODE: number = 6;

/**
 * Number of skips after updating sensor characteristics
 */
export const SKIPS_UPDATE_SENSOR_CHARACTERISTICS: number = 80;

/**
 * Number of skips when BroadLink RM ping failed
 */
export const SKIPS_PING_DEVICE_FAIL: number = 4;

/**
 * IR hex code used to toggle active
 */
export const DATA_ACTIVE: string = "26005800481718161916161916311817191619171816192d181918171817181719161817181718161" +
    "a2e1816192d19171800066b45191631190006604817182d1a00066147151a2d190006614916192d190006604618172f18000d05";

/**
 * IR hex code used to increase rotation speed
 */
export const DATA_ROTATION_SPEED_UP: string = "260058004718181619161917172f1817191618171817182c1919172e1618182f161916" +
    "301a2d192d1817182f161817181a00066d4618182d190006614618172f1900065f4817182e1900065f4816182e180006604818172d19000d" +
    "05";

/**
 * IR hex code used to decrease rotation speed
 */
export const DATA_ROTATION_SPEED_DOWN: string = "2600580047161917171719151a2d171818171619161a182d1a15173019151a2d192d" +
    "1a1718161730161819161718172f1a0006664617182f1900065f4817182e18000660441917301a00065e4818172d1a00065f4618182e1900" +
    "0d05";

/**
 * IR hex code used to toggle swing mode
 */
export const DATA_SWING_MODE: string = "260058004716191517191917192c1619171816191819182d151b1916182d192e19171817182c1" +
    "730181815301a2d192d160006594718192d1700066243191731180006604816192d190006604717182d190006604817182d18000d05";

/**
 * How many times the identify function should toggle active
 */
export const TOGGLES_IDENTIFY_ACTIVE: number = 2;

/**
 * Current temperature decimal precision
 */
export const MIN_STEP_CURRENT_TEMPERATURE: number = 0.01;

/**
 * Current relative humidity decimal precision
 */
export const MIN_STEP_CURRENT_RELATIVE_HUMIDITY: number = 0.01;

/**
 * How much to increase or decrease rotation speed by
 * You must clear persist storage for this plugin after changing this!
 */
export const MIN_STEP_ROTATION_SPEED: number = 10;

/**
 * Accessory identifier used by Homebridge to assign accessories to plugins
 * You must edit your Homebridge config after changing this!
 */
export const ACCESSORY: string = "DysonBP01";