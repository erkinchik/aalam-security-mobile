import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";

/**
 * Сирена оператора повторяет ту, что играет админ-панель: там она синтезируется
 * Web Audio (квадратная волна, поочерёдно 880 и 660 Гц по 0.35 с с интервалом
 * 0.4 с). В React Native синтезатора нет, поэтому один цикл записан в файл —
 * длина 0.8 с подобрана так, чтобы петля шла без стыка.
 */
const ALARM_SOURCE = require("../../assets/sounds/operator-alarm.wav");

async function ensureAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  });
}

/** Зацикленная сирена входящего вызова. Ссылку держим здесь: остановить звук
 *  должен уметь любой вызывающий, в том числе размонтирование экрана. */
let loopingSound: Audio.Sound | null = null;
/** Загрузка асинхронна: без флага два быстрых вызова дадут две сирены. */
let isStartingLoop = false;

export const sosSoundService = {
  /** Звучит, пока есть непринятое предложение — как сирена в админ-панели. */
  async startOfferAlarm(): Promise<void> {
    if (loopingSound || isStartingLoop) return;
    isStartingLoop = true;
    try {
      await ensureAudioMode();
      const { sound } = await Audio.Sound.createAsync(ALARM_SOURCE, {
        isLooping: true,
        shouldPlay: true,
      });
      // Пока звук грузился, вызов могли принять — тогда не начинаем.
      if (!isStartingLoop) {
        await sound.unloadAsync().catch(() => {});
        return;
      }
      loopingSound = sound;
    } catch (e) {
      if (__DEV__) console.warn("[sosSoundService] startOfferAlarm error:", e);
    } finally {
      isStartingLoop = false;
    }
  },

  async stopOfferAlarm(): Promise<void> {
    isStartingLoop = false;
    const sound = loopingSound;
    if (!sound) return;
    loopingSound = null;
    try {
      await sound.stopAsync();
    } catch {
      // Звук мог не успеть начаться — выгрузить всё равно нужно.
    }
    await sound.unloadAsync().catch(() => {});
  },
};
