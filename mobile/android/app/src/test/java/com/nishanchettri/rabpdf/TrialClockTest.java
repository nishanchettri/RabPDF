package com.nishanchettri.rabpdf;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class TrialClockTest {
    @Test public void trialExpiresAt24Hours() {
        assertEquals(86400000L, TrialClock.remaining(1000,1000));
        assertEquals(1L, TrialClock.remaining(1000,86400999));
        assertEquals(0L, TrialClock.remaining(1000,86401000));
        assertEquals(0L, TrialClock.remaining(1000,172801000));
    }
    @Test public void clockRollbackDoesNotExtendTrialDuringSameBoot() {
        assertEquals(101000L, TrialClock.effectiveNow(90000,100000,6000,5000));
    }
    @Test public void rebootUsesTheLaterWallClock() {
        assertEquals(105000L, TrialClock.effectiveNow(105000,100000,500,10000));
    }
}
