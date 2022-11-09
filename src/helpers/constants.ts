/**
 * Loop interval in milliseconds
 */
export const INTERVAL: number = 650;

/**
 * Number of active skips after turning on the fan
 */
export const SKIPS_ACTIVE: number = 2;

/**
 * Number of active skips after turning off the fan
 */
export const SKIPS_INACTIVE: number = 8;

/**
 * Number of swing mode skips
 */
export const SKIPS_SWING_MODE: number = 6;

/**
 * Number of device skips
 */
export const SKIPS_DEVICE: number = 4;

/**
 * IR hex code used to toggle active
 */
export const SIGNAL_ACTIVE: string = "26005800481718161916161916311817191619171816192d181918171817181719161817181718161a2e1816192d19171800066b45191631190006604817182d1a00066147151a2d190006614916192d190006604618172f18000d05";

/**
 * IR hex code used to turn up rotation speed
 */
export const SIGNAL_ROTATION_SPEED_UP: string = "260058004718181619161917172f1817191618171817182c1919172e1618182f161916301a2d192d1817182f161817181a00066d4618182d190006614618172f1900065f4817182e1900065f4816182e180006604818172d19000d05";

/**
 * IR hex code used to turn down rotation speed
 */
export const SIGNAL_ROTATION_SPEED_DOWN: string = "2600580047161917171719151a2d171818171619161a182d1a15173019151a2d192d1a1718161730161819161718172f1a0006664617182f1900065f4817182e18000660441917301a00065e4818172d1a00065f4618182e19000d05";

/**
 * IR hex code used to turn toggle swing mode
 */
export const SIGNAL_SWING_MODE: string = "260058004716191517191917192c1619171816191819182d151b1916182d192e19171817182c1730181815301a2d192d160006594718192d1700066243191731180006604816192d190006604717182d190006604817182d18000d05";

/**
 * How much to increase or decrease rotation speed by
 * You must clear persist storage for this plugin after changing this!
 */
export const STEP_SIZE: number = 10;

/**
 * Placeholder string used by other strings to insert values
 */
export const PLACEHOLDER: string = "$VAL$";

/**
 * Node persist variable name for current active
 * You must manually set active to off when changing this!
 */
export const STORAGE_CURRENT_ACTIVE: string = PLACEHOLDER + " current active";

/**
 * Node persist variable name for target active
 * You must manually set active to off when changing this!
 */
export const STORAGE_TARGET_ACTIVE: string = PLACEHOLDER + " target active";

/**
 * Node persist variable name for current rotation speed
 * You must manually set rotation speed to 1 when changing this!
 */
export const STORAGE_CURRENT_ROTATION_SPEED: string = PLACEHOLDER + " current rotation speed";

/**
 * Node persist variable name for target rotation speed
 * You must manually set rotation speed to 1 when changing this!
 */
export const STORAGE_TARGET_ROTATION_SPEED: string = PLACEHOLDER + " target rotation speed";

/**
 * Node persist variable name for current swing mode
 * You must manually set swing mode to off when changing this!
 */
export const STORAGE_CURRENT_SWING_MODE: string = PLACEHOLDER + " current swing mode";

/**
 * Node persist variable name for target swing mode
 * You must manually set swing mode to off when changing this!
 */
export const STORAGE_TARGET_SWING_MODE: string = PLACEHOLDER + " target swing mode";

/**
 * Accessory ID, used by Homebridge to assign accessories to plugins
 * You must edit your Homebridge config after changing this!
 */
export const ACCESSORY_ID: string = "DysonBP01";