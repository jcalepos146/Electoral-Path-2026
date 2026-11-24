"""Consistency checks across the data files. They catch called races missing vote totals and
calls that disagree between the race tables and the simulator datasets."""
import json
import unittest
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data'


def load(name):
    return json.loads((DATA / name).read_text())


class StatewideRaces(unittest.TestCase):
    def check(self, races_file, cands_file, office):
        races, cands = load(races_file), load(cands_file)
        sim = {r['st']: r for r in load('sim_races.json') if r['office'] == office}
        for r in races:
            with self.subTest(race=r['race']):
                if r['status'] == 'Called':
                    self.assertIsNotNone(r['total_votes'], 'called race has no vote total')
                    self.assertIsNotNone(r['top_pct'], 'called race has no vote share')
                    rows = [c for c in cands if c['race'] == r['race']]
                    self.assertTrue(rows, 'called race has no candidates')
                    for c in rows:
                        self.assertIsNotNone(c['votes'], f"{c['candidate']} has no vote count")
                    self.assertEqual(sum(c['winner'] == 'Yes' for c in rows), 1, 'need exactly one winner marker')
                    self.assertTrue(sim[r['st']]['called'], 'simulator still lists a called race as uncalled')
                    self.assertEqual(sim[r['st']]['actual'], r['party'], 'simulator winner differs from race table')
                else:
                    self.assertFalse(sim[r['st']]['called'], 'simulator lists an uncalled race as called')

    def test_senate(self):
        self.check('senate_races.json', 'senate_candidates.json', 'senate')

    def test_governor(self):
        self.check('governor_races.json', 'governor_candidates.json', 'governor')


class HouseRaces(unittest.TestCase):
    def test_calls_match_simulator(self):
        sim = {h['seat']: h for h in load('sim_house.json')}
        for h in load('house.json'):
            with self.subTest(seat=h['seat']):
                expected = h['party'] if h['status'] == 'Called' else 'U'
                self.assertEqual(sim[h['seat']]['actual'], expected)

    def test_uncalled_races_say_what_is_next(self):
        for h in load('house.json'):
            if h['status'] != 'Called':
                with self.subTest(seat=h['seat']):
                    self.assertTrue(h.get('next_step') or h.get('note'))

    def test_every_seat_has_a_presidential_baseline(self):
        seats = {d['seat'] for d in load('district_pres24.json')['districts']}
        self.assertEqual(seats, {h['seat'] for h in load('house.json')})


if __name__ == '__main__':
    unittest.main()
