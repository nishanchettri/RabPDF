package com.nishanchettri.rabpdf;

final class TrialClock {
    static final long DURATION = 24L * 60 * 60 * 1000;
    static long effectiveNow(long wall, long previousWall, long elapsed, long previousElapsed) {
        return Math.max(wall, previousWall + Math.max(0, elapsed - previousElapsed));
    }
    static long remaining(long started, long now) {
        return Math.max(0, DURATION - (now - started));
    }
}
