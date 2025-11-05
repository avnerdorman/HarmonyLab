"""
Management command to import a MusicXML file as an exercise.

Usage:
  python manage.py import_musicxml <path_to_file.xml> --author=<email>

Example:
  python manage.py import_musicxml ~/Desktop/mypiece.musicxml --author=admin@example.com
"""
import json
import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

# Import the converter from the fetch_bach_chorales script
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../../scripts'))
try:
    from fetch_bach_chorales import m21_to_cir, build_events
except ImportError:
    m21_to_cir = None
    build_events = None

from apps.exercises.models import Exercise

User = get_user_model()


class Command(BaseCommand):
    help = 'Import a MusicXML file as an Exercise using music21 → CIR pipeline'

    def add_arguments(self, parser):
        parser.add_argument('file_path', type=str, help='Path to MusicXML file (.xml or .musicxml)')
        parser.add_argument('--author', type=str, required=True, help='Email of the exercise author')
        parser.add_argument('--title', type=str, help='Exercise title (defaults to filename)')
        parser.add_argument('--public', action='store_true', help='Make the exercise public')
        parser.add_argument('--start', type=int, default=0, help='Start measure (0-indexed, default: 0)')
        parser.add_argument('--end', type=int, default=None, help='End measure (exclusive, default: all)')

    def handle(self, *args, **options):
        file_path = options['file_path']
        author_email = options['author']
        title = options.get('title')
        is_public = options['public']
        start_measure = options['start']
        end_measure = options['end']

        # Check dependencies
        if m21_to_cir is None or build_events is None:
            raise CommandError(
                'Could not import converter functions. Make sure music21 is installed: '
                'pip install music21'
            )

        try:
            from music21 import converter
        except ImportError:
            raise CommandError(
                'music21 is not installed. Install it with: pip install music21'
            )

        # Find the author
        try:
            author = User.objects.get(email=author_email)
        except User.DoesNotExist:
            raise CommandError(f'User with email "{author_email}" not found')

        # Check file exists
        if not os.path.exists(file_path):
            raise CommandError(f'File not found: {file_path}')

        # Check file extension
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in ['.xml', '.musicxml', '.mxl']:
            raise CommandError(f'File must be a MusicXML file (.xml, .musicxml, or .mxl)')

        # Load MusicXML with music21
        self.stdout.write(f'Loading MusicXML file: {file_path}')
        try:
            score = converter.parse(file_path)
        except Exception as e:
            raise CommandError(f'Failed to parse MusicXML: {str(e)}')

        # Convert to CIR (Canonical Internal Representation)
        self.stdout.write('Converting to internal format...')
        try:
            cir = m21_to_cir(score)
        except Exception as e:
            raise CommandError(f'Failed to convert to CIR: {str(e)}')

        # Get metadata
        meta = cir.get('meta', {})
        measures = cir.get('measures', [])

        if not measures:
            raise CommandError('No measures found in MusicXML file')

        # Extract excerpt if specified
        if end_measure is not None:
            excerpt_measures = measures[start_measure:end_measure]
            measure_range = f"mm. {start_measure+1}–{end_measure}"
        else:
            excerpt_measures = measures[start_measure:]
            measure_range = f"mm. {start_measure+1}–{len(measures)}" if start_measure > 0 else f"complete ({len(measures)} measures)"

        if not excerpt_measures:
            raise CommandError(f'No measures in range [{start_measure}:{end_measure}]')

        # Generate title from filename if not provided
        if not title:
            basename = os.path.basename(file_path)
            name_without_ext = os.path.splitext(basename)[0]
            title = f"{name_without_ext} ({measure_range})" if start_measure > 0 or end_measure else name_without_ext

        # Build exercise data structure
        exercise_data = {
            "type": "musicxml",
            "mode": "play-all-voices",
            "score": {
                "meta": meta,
                "measures": excerpt_measures
            },
            "source": {
                "type": "musicxml",
                "filename": os.path.basename(file_path),
                "originalPath": file_path,
                "imported": True
            },
            "targetVoices": "all",
            "display": {
                "showFigures": False,
                "showRomans": False,
                "transpose": 0,
                "tempo": 60
            },
            "grading": {
                "onsetWindowMs": 150,
                "releaseTolerancePct": 40,
                "octaveFlexible": False
            },
            "excerpt": {
                "startMeasure": start_measure,
                "endMeasure": end_measure if end_measure else len(measures)
            },
            "introText": f"Play {title}.",
            "reviewText": "Good work!",
            # Legacy fields for compatibility
            "key": meta.get("key", "C"),
            "keySignature": meta.get("key", "C"),
            "staffDistribution": "chorale"
        }

        # Optionally build events timeline for grading
        try:
            events = build_events(cir)
            if events:
                exercise_data["events"] = [
                    {
                        "start": e.start,
                        "perStaff": e.perStaff
                    }
                    for e in events
                ]
                self.stdout.write(f'  Generated {len(events)} grading events')
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  Could not generate events: {str(e)}'))

        # Create the Exercise
        exercise = Exercise(
            description=title,
            data=exercise_data,
            authored_by=author,
            is_public=is_public
        )
        exercise.save()

        self.stdout.write(self.style.SUCCESS(
            f'\nSuccessfully created exercise {exercise.id}: {title}'
        ))
        self.stdout.write(f'  Measures: {len(excerpt_measures)}')
        self.stdout.write(f'  Key: {meta.get("key", "?")}')
        self.stdout.write(f'  Time: {meta.get("time", "?")}')
        self.stdout.write(f'  Public: {is_public}')
        self.stdout.write(f'\n  View at: /lab/exercise/{exercise.id}')
